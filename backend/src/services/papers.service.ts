import { UnknownTopicError } from "../errors.js";
import { paperRepository, type UpsertPaperInput } from "../repositories/paper.repository.js";
import {
  topicPaperMatchRepository,
  type ListByTopicQuery,
  type TopicPaperMatchWithPaper,
} from "../repositories/topicPaperMatch.repository.js";
import { trackedTopicRepository } from "../repositories/trackedTopic.repository.js";
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
}

export interface ListPapersForTopicResult {
  topic: {
    id: string;
    name: string;
    lastFetchedAt: string | null;
  };
  items: PublicPaperItem[];
  nextCursor?: string;
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
    const rows = await topicPaperMatchRepository.listByTopic(repoQuery);

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
      ...(nextCursor !== undefined ? { nextCursor } : {}),
    };
  },

  async upsertFromArxiv(input: UpsertPaperInput): Promise<string> {
    const paper = await paperRepository.upsertBySource(input);
    return paper.id;
  },
};
