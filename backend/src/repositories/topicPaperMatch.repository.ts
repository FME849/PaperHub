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

import type { Paper, TopicPaperMatch, PaperSummary } from "@prisma/client";

export interface TopicPaperMatchWithPaper extends TopicPaperMatch {
  paper: Paper & { summary?: PaperSummary | null };
}

export interface NewAttributionRow {
  paperId: string;
  title: string;
  authors: string[];
  publishedAt: Date;
  fetchedAt: Date;
  summaryStatus: "SUCCEEDED" | "PENDING_RETRY" | "NOT_SUMMARISABLE" | "ABSENT";
  summaryBullets: string[];
  matchedTopics: Array<{ id: string; name: string }>;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
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
      include: { paper: { include: { summary: true } } },
      orderBy,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  },

  /**
   * All papers newly attributed to the given user's tracked topics in the given
   * fetch cycle, ordered by the digest ranking rule (research.md Decision 4):
   * publishedAt DESC, fetchedAt DESC, paperId ASC. Topics the user has deleted
   * are excluded automatically by the trackedTopic.userId filter (FR-008 + the
   * "deleted topic" edge case). A paper matched by more than one of the user's
   * topics in this cycle is collapsed to a single row with all matched topics.
   */
  async listNewAttributionsForUserInCycle(
    userId: number,
    cycleId: string,
  ): Promise<NewAttributionRow[]> {
    const matches = await prisma.topicPaperMatch.findMany({
      where: { cycleId, trackedTopic: { userId } },
      include: {
        paper: { include: { summary: true } },
        trackedTopic: { select: { id: true, name: true } },
      },
    });

    const byPaper = new Map<string, NewAttributionRow>();
    for (const m of matches) {
      const existing = byPaper.get(m.paperId);
      if (existing) {
        if (!existing.matchedTopics.some((t) => t.id === m.trackedTopic.id)) {
          existing.matchedTopics.push({ id: m.trackedTopic.id, name: m.trackedTopic.name });
        }
        if (m.fetchedAt > existing.fetchedAt) existing.fetchedAt = m.fetchedAt;
        continue;
      }
      const summary = m.paper.summary;
      const summaryStatus = summary ? summary.status : "ABSENT";
      byPaper.set(m.paperId, {
        paperId: m.paperId,
        title: m.paper.title,
        authors: toStringArray(m.paper.authors),
        publishedAt: m.paper.publishedAt,
        fetchedAt: m.fetchedAt,
        summaryStatus,
        summaryBullets:
          summary && summary.status === "SUCCEEDED" ? toStringArray(summary.bullets) : [],
        matchedTopics: [{ id: m.trackedTopic.id, name: m.trackedTopic.name }],
      });
    }

    return [...byPaper.values()].sort((a, b) => {
      const pub = b.publishedAt.getTime() - a.publishedAt.getTime();
      if (pub !== 0) return pub;
      const fetched = b.fetchedAt.getTime() - a.fetchedAt.getTime();
      if (fetched !== 0) return fetched;
      return a.paperId < b.paperId ? -1 : a.paperId > b.paperId ? 1 : 0;
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
