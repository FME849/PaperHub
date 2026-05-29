import { UnknownPaperError, UnknownTopicError } from "../errors.js";
import { favoriteRepository } from "../repositories/favorite.repository.js";
import {
  paperRepository,
  type UpsertPaperInput,
} from "../repositories/paper.repository.js";
import {
  topicPaperMatchRepository,
  type ListByTopicQuery,
  type TopicPaperMatchWithPaper,
} from "../repositories/topicPaperMatch.repository.js";
import { trackedTopicRepository } from "../repositories/trackedTopic.repository.js";
import { prisma } from "../db.js";
import type { TopicPapersQuery } from "../validation/schemas.js";

export interface PublicPaperItem {
  id: string;
  primarySource: string;
  sourcePaperId: string;
  title: string;
  abstract: string;
  authors: string[];
  sourceUrl: string;
  publishedAt: string;
  matchedAt: string;
  summaryStatus?: string;
  summaryBullets?: string[];
}

export interface ListPapersForTopicResult {
  topic: {
    id: string;
    name: string;
    lastFetchedAt: string | null;
  };
  items: PublicPaperItem[];
  nextCursor?: string;
  totalCount: number;
}

export interface PaperDetailSummary {
  status: "SUCCEEDED" | "PENDING_RETRY" | "NOT_SUMMARISABLE";
  bullets: string[];
  generatedAt: string | null;
  model: string | null;
  failureReason: string | null;
}

export interface PaperDetailResult {
  paper: {
    id: string;
    primarySource: string;
    sourcePaperId: string;
    title: string;
    abstract: string;
    authors: string[];
    sourceUrl: string;
    publishedAt: string;
    firstFetchedAt: string;
  };
  summary: PaperDetailSummary;
  topics: Array<{ id: string; name: string }>;
  isFavorited: boolean;
  favoritedAt: string | null;
}

function toJsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function toPublicPaperItem(row: TopicPaperMatchWithPaper): PublicPaperItem {
  return {
    id: row.paper.id,
    primarySource: row.paper.primarySource,
    sourcePaperId: row.paper.sourcePaperId,
    title: row.paper.title,
    abstract: row.paper.abstract,
    authors: toJsonStringArray(row.paper.authors),
    sourceUrl: row.paper.sourceUrl,
    publishedAt: row.paper.publishedAt.toISOString(),
    matchedAt: row.fetchedAt.toISOString(),
    summaryStatus: row.paper.summary?.status,
    summaryBullets: row.paper.summary?.bullets ? toJsonStringArray(row.paper.summary.bullets) : undefined,
  };
}

export const papersService = {
  async listPapersForTopic(
    userId: number,
    topicId: string,
    query: TopicPapersQuery,
  ): Promise<ListPapersForTopicResult> {
    const topic = await trackedTopicRepository.findByIdForUser(userId, topicId);
    if (!topic) throw new UnknownTopicError();

    const repoQuery: ListByTopicQuery = {
      topicId,
      sort: query.sort,
      order: query.order,
      limit: query.limit,
      cursor: query.cursor,
    };
    const [rows, totalCount] = await Promise.all([
      topicPaperMatchRepository.listByTopic(repoQuery),
      prisma.topicPaperMatch.count({ where: { trackedTopicId: topicId } }),
    ]);

    let nextCursor: string | undefined;
    if (rows.length > query.limit) {
      const last = rows[query.limit - 1];
      if (last) nextCursor = last.id;
      rows.length = query.limit;
    }

    return {
      topic: {
        id: topic.id,
        name: topic.name,
        lastFetchedAt: topic.lastFetchedAt ? topic.lastFetchedAt.toISOString() : null,
      },
      items: rows.map(toPublicPaperItem),
      totalCount,
      ...(nextCursor !== undefined ? { nextCursor } : {}),
    };
  },

  async upsertFromArxiv(input: UpsertPaperInput): Promise<string> {
    const paper = await paperRepository.upsertBySource(input);
    return paper.id;
  },

  async getPaperDetailForUser(
    userId: number,
    paperId: string,
  ): Promise<PaperDetailResult> {
    const accessible = await paperRepository.findByIdAccessibleToUser(userId, paperId);
    if (!accessible) throw new UnknownPaperError();

    const { paper, summary } = accessible;

    const [favorite, topicRows] = await Promise.all([
      favoriteRepository.findByUserAndPaper(userId, paperId),
      prisma.topicPaperMatch.findMany({
        where: { paperId, trackedTopic: { userId } },
        select: { trackedTopic: { select: { id: true, name: true } } },
      }),
    ]);

    const topics = topicRows
      .map((r) => r.trackedTopic)
      .filter((t): t is { id: string; name: string } => t !== null);

    const summaryView: PaperDetailSummary = (() => {
      if (summary && summary.status === "SUCCEEDED") {
        return {
          status: "SUCCEEDED",
          bullets: toJsonStringArray(summary.bullets),
          generatedAt: summary.generatedAt ? summary.generatedAt.toISOString() : null,
          model: summary.model,
          failureReason: null,
        };
      }
      if (summary && summary.status === "NOT_SUMMARISABLE") {
        return {
          status: "NOT_SUMMARISABLE",
          bullets: [],
          generatedAt: null,
          model: null,
          failureReason: summary.failureReason,
        };
      }
      // PENDING_RETRY or no row at all
      return {
        status: "PENDING_RETRY",
        bullets: [],
        generatedAt: null,
        model: null,
        failureReason: null,
      };
    })();

    return {
      paper: {
        id: paper.id,
        primarySource: paper.primarySource,
        sourcePaperId: paper.sourcePaperId,
        title: paper.title,
        abstract: paper.abstract,
        authors: toJsonStringArray(paper.authors),
        sourceUrl: paper.sourceUrl,
        publishedAt: paper.publishedAt.toISOString(),
        firstFetchedAt: paper.firstFetchedAt.toISOString(),
      },
      summary: summaryView,
      topics,
      isFavorited: favorite !== null,
      favoritedAt: favorite ? favorite.createdAt.toISOString() : null,
    };
  },
};
