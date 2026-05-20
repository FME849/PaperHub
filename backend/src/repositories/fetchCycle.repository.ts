import type { FetchCycle, FetchCycleStatus, Prisma } from "@prisma/client";

import { prisma } from "../db.js";

export const fetchCycleRepository = {
  startCycle(): Promise<FetchCycle> {
    return prisma.fetchCycle.create({
      data: {
        status: "RUNNING",
        stats: {} as unknown as Prisma.InputJsonValue,
      },
    });
  },

  async finalizeCycle(
    id: string,
    status: FetchCycleStatus,
    stats: object,
  ): Promise<FetchCycle> {
    return prisma.fetchCycle.update({
      where: { id },
      data: {
        status,
        stats: stats as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
  },

  async promoteStuckRunningToFailed(): Promise<number> {
    const stuck = await prisma.fetchCycle.findMany({
      where: { status: "RUNNING" },
      select: { id: true, stats: true },
    });
    let promoted = 0;
    for (const row of stuck) {
      const stats = (typeof row.stats === "object" && row.stats !== null
        ? row.stats
        : {}) as Record<string, unknown>;
      await prisma.fetchCycle.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          stats: {
            ...stats,
            recoveryAction: "promoted-from-running-on-startup",
          } as unknown as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      });
      promoted++;
    }
    return promoted;
  },

  listLatest(limit: number): Promise<FetchCycle[]> {
    return prisma.fetchCycle.findMany({
      orderBy: { startedAt: "desc" },
      take: limit,
    });
  },
};
