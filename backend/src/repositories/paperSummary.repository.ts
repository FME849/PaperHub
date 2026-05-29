import type { PaperSummary, Prisma } from "@prisma/client";

import { prisma } from "../db.js";

export interface SetSucceededInput {
  bullets: string[];
  model: string;
}

export const paperSummaryRepository = {
  findByPaperId(paperId: string): Promise<PaperSummary | null> {
    return prisma.paperSummary.findUnique({ where: { paperId } });
  },

  /**
   * Atomically ensure a row exists for this paper. Idempotent — returns the
   * existing row if one is already present. Initial status is PENDING_RETRY.
   */
  upsertPending(paperId: string): Promise<PaperSummary> {
    return prisma.paperSummary.upsert({
      where: { paperId },
      update: {},
      create: {
        paperId,
        bullets: [] as unknown as Prisma.InputJsonValue,
        status: "PENDING_RETRY",
      },
    });
  },

  setSucceeded(paperId: string, input: SetSucceededInput): Promise<PaperSummary> {
    return prisma.paperSummary.update({
      where: { paperId },
      data: {
        bullets: input.bullets as unknown as Prisma.InputJsonValue,
        status: "SUCCEEDED",
        model: input.model,
        failureReason: null,
        generatedAt: new Date(),
      },
    });
  },

  setNotSummarisable(paperId: string, reason: string): Promise<PaperSummary> {
    return prisma.paperSummary.update({
      where: { paperId },
      data: {
        bullets: [] as unknown as Prisma.InputJsonValue,
        status: "NOT_SUMMARISABLE",
        model: null,
        failureReason: reason,
        generatedAt: null,
      },
    });
  },

  /**
   * Used by the backfill script (research.md Decision 13).
   * Returns paperIds that either lack a summary row entirely OR have
   * status = PENDING_RETRY, in stable order so the backfill is resumable.
   */
  async listPapersNeedingSummary(limit: number): Promise<string[]> {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT p.id AS id
      FROM Paper p
      LEFT JOIN PaperSummary s ON s.paperId = p.id
      WHERE s.id IS NULL OR s.status = 'PENDING_RETRY' OR s.model = 'gemini-2.0-flash-mocked'
      ORDER BY p.firstFetchedAt DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => r.id);
  },
};
