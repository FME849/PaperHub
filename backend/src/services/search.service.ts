import { favoriteRepository } from "../repositories/favorite.repository.js";
import {
  paperRepository,
  type SearchByUserCatalogQuery,
  type SearchResultRow,
} from "../repositories/paper.repository.js";
import { paperSummaryRepository } from "../repositories/paperSummary.repository.js";
import type { SearchPapersQuery } from "../validation/schemas.js";

export interface SearchResultItem {
  id: string;
  primarySource: string;
  sourcePaperId: string;
  title: string;
  abstractExcerpt: string;
  authors: string[];
  sourceUrl: string;
  publishedAt: string;
  topics: Array<{ id: string; name: string }>;
  isFavorited: boolean;
  summaryAvailable: boolean;
  score: number;
}

export interface SearchPapersResult {
  query: string;
  items: SearchResultItem[];
  nextCursor?: string;
}

const ABSTRACT_EXCERPT_LENGTH = 280;

function toJsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function excerpt(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n).replace(/\s+\S*$/, "") + "…";
}

function dedupeByFirst<T, K>(rows: T[], key: (row: T) => K): T[] {
  const seen = new Set<K>();
  const out: T[] = [];
  for (const row of rows) {
    const k = key(row);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(row);
    }
  }
  return out;
}

export const searchService = {
  async searchPapers(userId: number, query: SearchPapersQuery): Promise<SearchPapersResult> {
    const repoQuery: SearchByUserCatalogQuery = {
      userId,
      query: query.q,
      sort: query.sort,
      order: query.order,
      limit: query.limit,
      cursor: query.cursor,
      topicId: query.topicId,
      publishedFrom: query.publishedFrom,
      publishedTo: query.publishedTo,
      author: query.author,
    };

    const rows = await paperRepository.searchByUserCatalog(repoQuery);

    // Aggregate matching topics per paper, preserving the first-seen ordering
    // (rows come back ordered by score / publishedAt / id).
    const byPaperId = new Map<string, SearchResultRow & { topics: Array<{ id: string; name: string }> }>();
    for (const row of rows) {
      const existing = byPaperId.get(row.id);
      if (existing) {
        if (!existing.topics.some((t) => t.id === row.topicId)) {
          existing.topics.push({ id: row.topicId, name: row.topicName });
        }
      } else {
        byPaperId.set(row.id, {
          ...row,
          topics: [{ id: row.topicId, name: row.topicName }],
        });
      }
    }

    const aggregated = dedupeByFirst([...byPaperId.values()], (r) => r.id);

    let nextCursor: string | undefined;
    if (aggregated.length > query.limit) {
      const last = aggregated[query.limit - 1];
      if (last) nextCursor = last.id;
      aggregated.length = query.limit;
    }

    // Per-paper sidecar lookups: isFavorited + summaryAvailable.
    // Two queries per page is fine at our scale; if it ever matters, batch.
    const items: SearchResultItem[] = await Promise.all(
      aggregated.map(async (row) => {
        const [favorite, summary] = await Promise.all([
          favoriteRepository.findByUserAndPaper(userId, row.id),
          paperSummaryRepository.findByPaperId(row.id),
        ]);

        return {
          id: row.id,
          primarySource: row.primarySource,
          sourcePaperId: row.sourcePaperId,
          title: row.title,
          abstractExcerpt: excerpt(row.abstract, ABSTRACT_EXCERPT_LENGTH),
          authors: toJsonStringArray(row.authors),
          sourceUrl: row.sourceUrl,
          publishedAt: row.publishedAt.toISOString(),
          topics: row.topics,
          isFavorited: favorite !== null,
          summaryAvailable: summary?.status === "SUCCEEDED",
          score: row.score,
        };
      }),
    );

    return {
      query: query.q,
      items,
      ...(nextCursor !== undefined ? { nextCursor } : {}),
    };
  },
};
