import crypto from "node:crypto";

import type { Request, Response } from "express";

import { ValidationFailedError } from "../errors.js";
import { clientIp } from "../middleware/rateLimit.js";
import { passwordResetAuditEventRepository } from "../repositories/passwordResetAuditEvent.repository.js";
import { passwordResetService } from "../services/passwordReset.service.js";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  resetTokenQuerySchema,
} from "../validation/schemas.js";

const NEUTRAL_FORGOT_MESSAGE =
  "If an account exists for that address, a password reset link has been sent.";

function hashIp(req: Request): string {
  return crypto.createHash("sha256").update(clientIp(req)).digest("hex");
}

export const passwordResetController = {
  // Always returns the same neutral 200 (no account enumeration). The
  // `throttled` flag is set by the route-level limiter wrapper when the request
  // was over the limit — we still return the neutral body but skip sending.
  async forgotPassword(req: Request, res: Response): Promise<void> {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationFailedError(parsed.error.flatten());
    }

    const ipHash = hashIp(req);

    // Send the neutral response BEFORE any account-dependent work, so response
    // latency cannot reveal whether the account exists (FR-003).
    res.status(200).json({ message: NEUTRAL_FORGOT_MESSAGE });

    if (req.rateLimited === true) {
      await passwordResetAuditEventRepository.record({
        eventType: "THROTTLED",
        emailAttempted: parsed.data.email,
        ipHash,
      });
      return;
    }

    try {
      await passwordResetService.requestReset({ email: parsed.data.email, ipHash });
    } catch (err) {
      console.error("[password-reset] requestReset failed:", err);
    }
  },

  async validateToken(req: Request, res: Response): Promise<void> {
    const parsed = resetTokenQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationFailedError(parsed.error.flatten());
    }
    const valid = await passwordResetService.verifyToken(parsed.data.token);
    res.status(200).json({ valid });
  },

  async resetPassword(req: Request, res: Response): Promise<void> {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      // A weak/missing newPassword returns 422 BEFORE the token is consumed,
      // so the link stays usable for another attempt (US2 scenario 5).
      throw new ValidationFailedError(parsed.error.flatten());
    }
    await passwordResetService.completeReset({
      rawToken: parsed.data.token,
      newPassword: parsed.data.newPassword,
    });
    res.status(200).json({
      message: "Your password has been reset. You can now log in with your new password.",
    });
  },
};
