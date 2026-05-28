import crypto from "node:crypto";

import type { EmailFailureClass } from "@prisma/client";

import { env } from "../config/env.js";
import { NotFoundError } from "../errors.js";
import { digestSendRecordRepository } from "../repositories/digestSendRecord.repository.js";
import { emailDeliveryFailureRepository } from "../repositories/emailDeliveryFailure.repository.js";
import { emailNotificationPreferenceRepository } from "../repositories/emailNotificationPreference.repository.js";
import {
  topicPaperMatchRepository,
  type NewAttributionRow,
} from "../repositories/topicPaperMatch.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { prisma } from "../db.js";

import type { DigestPaper, DigestPayload } from "./email-templates/digest.js";
import { emailService } from "./email.service.js";

// ---------------------------------------------------------------------------
// Unsubscribe token (research.md Decision 6)
// Format: v1:<base64url(userId)>.<base64url(hmac)>; O(1) verification.
// ---------------------------------------------------------------------------

function macFor(userIdPart: string): string {
  return crypto
    .createHmac("sha256", env.UNSUBSCRIBE_TOKEN_SECRET)
    .update(userIdPart)
    .digest("base64url");
}

export function buildUnsubscribeToken(userId: number): string {
  const userIdPart = Buffer.from(String(userId), "utf8").toString("base64url");
  return `v1:${userIdPart}.${macFor(userIdPart)}`;
}

export function verifyUnsubscribeToken(token: string): number | null {
  if (!token.startsWith("v1:")) return null;
  const body = token.slice("v1:".length);
  const dot = body.indexOf(".");
  if (dot <= 0) return null;
  const userIdPart = body.slice(0, dot);
  const providedMac = body.slice(dot + 1);
  const expectedMac = macFor(userIdPart);

  const a = Buffer.from(providedMac);
  const b = Buffer.from(expectedMac);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const decoded = Buffer.from(userIdPart, "base64url").toString("utf8");
  const userId = Number(decoded);
  if (!Number.isInteger(userId) || userId <= 0) return null;
  return userId;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classifyToFailureClass(
  failureClass: "HARD_BOUNCE" | "SOFT_BOUNCE" | "CONNECTION_ERROR" | "TIMEOUT" | "OTHER",
): EmailFailureClass {
  return failureClass;
}

function buildPayload(
  userId: number,
  cycleId: string,
  rows: NewAttributionRow[],
): DigestPayload {
  const topPicks: DigestPaper[] = rows.slice(0, env.DIGEST_TOP_PICKS_COUNT).map((r) => ({
    paperId: r.paperId,
    title: r.title,
    authors: r.authors,
    summaryStatus: r.summaryStatus,
    summaryBullets: r.summaryBullets,
    matchedTopicNames: r.matchedTopics.map((t) => t.name),
    detailUrl: `${env.FRONTEND_BASE_URL}/papers/${r.paperId}`,
  }));

  return {
    recipientUserId: userId,
    cycleId,
    topPicks,
    candidatePaperCount: rows.length,
    seeMoreUrl: `${env.FRONTEND_BASE_URL}/cycles/${cycleId}`,
    unsubscribeUrl: `${env.PUBLIC_API_BASE_URL}/api/notifications/unsubscribe?token=${buildUnsubscribeToken(
      userId,
    )}`,
  };
}

export interface CycleDigestStats {
  sent: number;
  suppressedEmpty: number;
  suppressedPrefOff: number;
  suppressedBounce: number;
  failed: number;
  skippedAlreadyProcessed: number;
}

export const notificationsService = {
  /**
   * Send one digest per opted-in user for the given fetch cycle. Idempotent,
   * isolated per user, and resilient: one user's failure never aborts the rest
   * (FR-014 / SC-007).
   */
  async runForCycle(cycleId: string): Promise<CycleDigestStats> {
    const stats: CycleDigestStats = {
      sent: 0,
      suppressedEmpty: 0,
      suppressedPrefOff: 0,
      suppressedBounce: 0,
      failed: 0,
      skippedAlreadyProcessed: 0,
    };

    const userIds = await emailNotificationPreferenceRepository.listEnabledUserIds();
    console.log(`[notifications] cycle=${cycleId} eligible opted-in users=${userIds.length}`);

    for (const userId of userIds) {
      try {
        await this.processUser(userId, cycleId, stats);
      } catch (err) {
        stats.failed++;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[notifications] user=${userId} cycle=${cycleId} unexpected error: ${message}`);
      }
    }

    console.log(
      `[notifications] cycle=${cycleId} complete: ${JSON.stringify(stats)}`,
    );
    return stats;
  },

  async processUser(userId: number, cycleId: string, stats: CycleDigestStats): Promise<void> {
    // 1. Idempotency claim.
    const claim = await digestSendRecordRepository.tryClaim(userId, cycleId);
    if (!claim.claimed) {
      stats.skippedAlreadyProcessed++;
      console.log(
        `[notifications] user=${userId}: existing DigestSendRecord for cycle ${cycleId} (outcome=${claim.record.outcome}); skipping`,
      );
      return;
    }
    const recordId = claim.record.id;

    // 2. Candidate set for this cycle.
    const rows = await topicPaperMatchRepository.listNewAttributionsForUserInCycle(userId, cycleId);
    if (rows.length === 0) {
      await digestSendRecordRepository.complete(recordId, {
        outcome: "SUPPRESSED_EMPTY",
        candidatePaperCount: 0,
      });
      stats.suppressedEmpty++;
      console.log(`[notifications] user=${userId}: 0 candidate papers; suppressing (SUPPRESSED_EMPTY)`);
      return;
    }

    // 3. Re-check preference (may have flipped after the claim).
    const stillEnabled = await emailNotificationPreferenceRepository.existsEnabled(userId);
    if (!stillEnabled) {
      await digestSendRecordRepository.complete(recordId, {
        outcome: "SUPPRESSED_PREFERENCE_OFF",
        candidatePaperCount: rows.length,
      });
      stats.suppressedPrefOff++;
      console.log(`[notifications] user=${userId}: preference off at compose time; suppressing`);
      return;
    }

    // 4. Resolve recipient.
    const user = await userRepository.findById(userId);
    if (!user) {
      await digestSendRecordRepository.complete(recordId, {
        outcome: "SUPPRESSED_PREFERENCE_OFF",
        candidatePaperCount: rows.length,
        failureReason: "user no longer exists",
      });
      stats.suppressedPrefOff++;
      return;
    }

    // 5. Bounce quarantine.
    const bounces = await emailDeliveryFailureRepository.consecutiveHardBouncesSinceLastSent(
      user.email,
      userId,
    );
    if (bounces >= env.HARD_BOUNCE_THRESHOLD) {
      await digestSendRecordRepository.complete(recordId, {
        outcome: "SUPPRESSED_BOUNCE_QUARANTINE",
        candidatePaperCount: rows.length,
        recipientEmail: user.email,
      });
      stats.suppressedBounce++;
      console.log(
        `[notifications] user=${userId}: address in bounce quarantine (${bounces} hard bounces); suppressing`,
      );
      return;
    }

    // 6. Compose + send.
    const payload = buildPayload(userId, cycleId, rows);
    const result = await emailService.sendDigest({ recipientEmail: user.email, payload });

    if (result.status === "ok") {
      await digestSendRecordRepository.complete(recordId, {
        outcome: "SENT",
        recipientEmail: user.email,
        candidatePaperCount: rows.length,
        includedPaperIds: payload.topPicks.map((p) => p.paperId),
      });
      stats.sent++;
      console.log(
        `[notifications] user=${userId}: SENT to ${user.email} (${payload.topPicks.length}/${rows.length} papers)`,
      );
      return;
    }

    // SMTP failure path.
    await emailDeliveryFailureRepository.record({
      recipientEmail: user.email,
      userId,
      failureClass: classifyToFailureClass(result.failureClass),
      smtpResponseCode: result.smtpResponseCode ?? null,
      message: result.message.slice(0, 500),
      digestSendRecordId: recordId,
    });
    const permanent = result.failureClass === "HARD_BOUNCE";
    await digestSendRecordRepository.complete(recordId, {
      outcome: permanent ? "FAILED_PERMANENT" : "FAILED_RETRYABLE",
      recipientEmail: user.email,
      candidatePaperCount: rows.length,
      failureReason: `${result.failureClass}${
        result.smtpResponseCode ? ` ${result.smtpResponseCode}` : ""
      }: ${result.message}`.slice(0, 255),
    });
    stats.failed++;
    console.warn(
      `[notifications] user=${userId}: SMTP failed (${result.failureClass}${
        result.smtpResponseCode ? ` ${result.smtpResponseCode}` : ""
      }); recording failure and continuing`,
    );
  },

  // -------------------------------------------------------------------------
  // "See more" backing read model (US3 / contracts/cycles.md)
  // -------------------------------------------------------------------------

  async listCyclePapersForUser(
    userId: number,
    cycleId: string,
    opts: { limit: number; cursor?: string },
  ): Promise<{
    cycle: { id: string; startedAt: string; finishedAt: string | null };
    papers: Array<{
      id: string;
      title: string;
      authors: string[];
      publishedAt: string;
      fetchedAt: string;
      matchedTopics: Array<{ id: string; name: string }>;
      summary: { status: NewAttributionRow["summaryStatus"]; bullets?: string[] };
      detailUrl: string;
    }>;
    nextCursor: string | null;
  }> {
    const rows = await topicPaperMatchRepository.listNewAttributionsForUserInCycle(userId, cycleId);
    if (rows.length === 0) {
      // Unknown cycle OR no papers for this user — identical 404 (no cross-user disclosure).
      throw new NotFoundError("Cycle not found.");
    }

    const cycle = await prisma.fetchCycle.findUnique({
      where: { id: cycleId },
      select: { id: true, startedAt: true, finishedAt: true },
    });
    if (!cycle) throw new NotFoundError("Cycle not found.");

    // Cursor pagination over the already-sorted rows (paperId is the cursor).
    let startIndex = 0;
    if (opts.cursor) {
      const idx = rows.findIndex((r) => r.paperId === opts.cursor);
      startIndex = idx >= 0 ? idx + 1 : 0;
    }
    const page = rows.slice(startIndex, startIndex + opts.limit);
    const nextCursor =
      startIndex + opts.limit < rows.length ? (page[page.length - 1]?.paperId ?? null) : null;

    return {
      cycle: {
        id: cycle.id,
        startedAt: cycle.startedAt.toISOString(),
        finishedAt: cycle.finishedAt ? cycle.finishedAt.toISOString() : null,
      },
      papers: page.map((r) => ({
        id: r.paperId,
        title: r.title,
        authors: r.authors,
        publishedAt: r.publishedAt.toISOString(),
        fetchedAt: r.fetchedAt.toISOString(),
        matchedTopics: r.matchedTopics,
        summary:
          r.summaryStatus === "SUCCEEDED"
            ? { status: r.summaryStatus, bullets: r.summaryBullets }
            : { status: r.summaryStatus },
        detailUrl: `/papers/${r.paperId}`,
      })),
      nextCursor,
    };
  },
};
