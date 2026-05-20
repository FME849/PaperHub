import type { Paper, TopicPaperMatch } from "@prisma/client";

import { prisma } from "../db.js";

export type PaperSortKey = "publishedAt" | "fetchedAt";
export type SortOrder = "asc" | "desc";

export interface ListByTopicQuery {
  topicId: string;
  sort: PaperSortKey;
  order: SortOrder;
  limit: number;
  cursor?: string;
}

export interface TopicPaperMatchWithPaper extends TopicPaperMatch {
  paper: Paper;
}

export const topicPaperMatchRepository = {
  async listByTopic(query: ListByTopicQuery): Promise<TopicPaperMatchWithPaper[]> {
    const { topicId, sort, order, limit, cursor } = query;
    const orderBy =
      sort === "publishedAt"
        ? [{ paper: { publishedAt: order } }, { id: order }]
        : [{ fetchedAt: order }, { id: order }];
    return prisma.topicPaperMatch.findMany({
      where: { trackedTopicId: topicId },
      include: { paper: true },
      orderBy,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  },

  async attribute(input: {
    trackedTopicId: string;
    paperId: string;
    cycleId?: string;
  }): Promise<{ match: TopicPaperMatch; created: boolean }> {
    try {
      const match = await prisma.topicPaperMatch.create({
        data: {
          trackedTopicId: input.trackedTopicId,
          paperId: input.paperId,
          ...(input.cycleId !== undefined ? { cycleId: input.cycleId } : {}),
        },
      });
      return { match, created: true };
    } catch (err) {
      if (
        typeof err === "object" &&
        err !== null &&
        (err as { code?: unknown }).code === "P2002"
      ) {
        const existing = await prisma.topicPaperMatch.findUnique({
          where: {
            trackedTopicId_paperId: {
              trackedTopicId: input.trackedTopicId,
              paperId: input.paperId,
            },
          },
        });
        if (existing) {
          return { match: existing, created: false };
        }
      }
      throw err;
    }
  },
};
