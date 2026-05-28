import type { DigestSendOutcome, DigestSendRecord, Prisma } from "@prisma/client";

import { prisma } from "../db.js";

export interface CompletePatch {
  outcome: DigestSendOutcome;
  recipientEmail?: string | null;
  candidatePaperCount?: number;
  includedPaperIds?: string[];
  failureReason?: string | null;
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "P2002"
  );
}

export const digestSendRecordRepository = {
  /**
   * Attempt to claim the (userId, fetchCycleId) slot by inserting a STARTED row.
   * Returns claimed=false if a record already exists for this pair (the unique
   * constraint is the idempotency lock — FR-006 / FR-007 / FR-011).
   */
  async tryClaim(
    userId: number,
    fetchCycleId: string,
  ): Promise<{ claimed: boolean; record: DigestSendRecord }> {
    try {
      const record = await prisma.digestSendRecord.create({
        data: { userId, fetchCycleId, outcome: "STARTED" },
      });
      return { claimed: true, record };
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        const existing = await prisma.digestSendRecord.findUnique({
          where: { userId_fetchCycleId: { userId, fetchCycleId } },
        });
        if (existing) return { claimed: false, record: existing };
      }
      throw err;
    }
  },

  complete(id: string, patch: CompletePatch): Promise<DigestSendRecord> {
    return prisma.digestSendRecord.update({
      where: { id },
      data: {
        outcome: patch.outcome,
        completedAt: new Date(),
        ...(patch.recipientEmail !== undefined ? { recipientEmail: patch.recipientEmail } : {}),
        ...(patch.candidatePaperCount !== undefined
          ? { candidatePaperCount: patch.candidatePaperCount }
          : {}),
        ...(patch.includedPaperIds !== undefined
          ? { includedPaperIds: patch.includedPaperIds as unknown as Prisma.InputJsonValue }
          : {}),
        ...(patch.failureReason !== undefined ? { failureReason: patch.failureReason } : {}),
      },
    });
  },

  findByUserAndCycle(
    userId: number,
    fetchCycleId: string,
  ): Promise<DigestSendRecord | null> {
    return prisma.digestSendRecord.findUnique({
      where: { userId_fetchCycleId: { userId, fetchCycleId } },
    });
  },
};
