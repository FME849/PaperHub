import crypto from "node:crypto";

import { env } from "../config/env.js";
import { DomainError } from "../errors.js";
import { passwordResetAuditEventRepository } from "../repositories/passwordResetAuditEvent.repository.js";
import { passwordResetRequestRepository } from "../repositories/passwordResetRequest.repository.js";
import { userRepository } from "../repositories/user.repository.js";

import { authService } from "./auth.service.js";
import { emailService } from "./email.service.js";

function generateToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

class InvalidResetTokenError extends DomainError {
  constructor() {
    super(
      400,
      "INVALID_RESET_TOKEN",
      "This reset link is invalid or has expired. Please request a new one.",
    );
  }
}

async function dispatchResetEmail(
  requestId: string,
  recipientEmail: string,
  rawToken: string,
): Promise<void> {
  const resetUrl = `${env.FRONTEND_BASE_URL}/reset-password?token=${rawToken}`;
  const maxAttempts = Math.max(1, env.PASSWORD_RESET_MAX_SEND_RETRIES);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await emailService.sendPasswordReset({
      recipientEmail,
      resetUrl,
      expiresInMinutes: env.PASSWORD_RESET_TOKEN_TTL_MINUTES,
    });

    if (result.status === "ok") {
      await passwordResetRequestRepository.recordSendOutcome(requestId, attempt, "sent");
      return;
    }

    // Hard bounces are permanent — do not retry.
    const permanent = result.failureClass === "HARD_BOUNCE";
    await passwordResetAuditEventRepository.record({
      eventType: "SEND_FAILED",
      detail: `${result.failureClass}: ${result.message}`.slice(0, 255),
    });

    if (permanent || attempt === maxAttempts) {
      await passwordResetRequestRepository.recordSendOutcome(
        requestId,
        attempt,
        permanent ? "failed" : "retry_exhausted",
      );
      if (!permanent) {
        await passwordResetAuditEventRepository.record({ eventType: "RETRY_EXHAUSTED" });
      }
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, env.PASSWORD_RESET_RETRY_BACKOFF_MS));
  }
}

export const passwordResetService = {
  hashToken,

  /**
   * US1 — request a reset. Account-dependent work only; the caller has already
   * returned the neutral response (no timing oracle). Never throws for an
   * unknown account — that path is silent + audited.
   */
  async requestReset(args: { email: string; ipHash: string | null }): Promise<void> {
    const user = await userRepository.findByEmail(args.email);
    if (!user) {
      await passwordResetAuditEventRepository.record({
        eventType: "SUPPRESSED_NO_ACCOUNT",
        emailAttempted: args.email,
        ipHash: args.ipHash,
      });
      return;
    }

    // At most one active link per account (FR-007).
    await passwordResetRequestRepository.invalidateActiveForUser(user.id, "SUPERSEDED");

    const { raw, hash } = generateToken();
    const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TOKEN_TTL_MINUTES * 60_000);
    const request = await passwordResetRequestRepository.create({
      userId: user.id,
      tokenHash: hash,
      expiresAt,
    });

    await passwordResetAuditEventRepository.record({
      eventType: "REQUESTED",
      userId: user.id,
      emailAttempted: args.email,
      ipHash: args.ipHash,
    });

    // Fire-and-forget: do not block the (already-sent) response on delivery.
    void dispatchResetEmail(request.id, user.email, raw).catch((err: unknown) => {
      console.error("[password-reset] dispatch failed:", err);
    });
  },

  /** US2 — lightweight validity check for the FE pre-check (does not consume). */
  async verifyToken(rawToken: string): Promise<boolean> {
    const row = await passwordResetRequestRepository.findValidByTokenHash(hashToken(rawToken));
    if (!row) return false;
    await passwordResetAuditEventRepository.record({
      eventType: "LINK_VERIFIED",
      userId: row.userId,
    });
    return true;
  },

  /** US2 — consume the token and set the new password. */
  async completeReset(args: { rawToken: string; newPassword: string }): Promise<void> {
    const row = await passwordResetRequestRepository.findValidByTokenHash(hashToken(args.rawToken));
    if (!row) {
      throw new InvalidResetTokenError();
    }

    // Consume first so the shared setPassword's "invalidate active links"
    // (reason PASSWORD_CHANGED) does not overwrite this row's USED reason.
    await passwordResetRequestRepository.markConsumed(row.id);
    await authService.setPassword(row.userId, args.newPassword);

    await passwordResetAuditEventRepository.record({
      eventType: "COMPLETED",
      userId: row.userId,
    });
  },
};
