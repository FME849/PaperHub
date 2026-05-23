import type { Paper, PaperSummary, Prisma } from "@prisma/client";

import { prisma } from "../db.js";

export interface UpsertPaperInput {
  primarySource: string;
  sourcePaperId: string;
  title: string;
  abstract: string;
  authors: string[];
  sourceUrl: string;
  publishedAt: Date;
}

export interface SearchByUserCatalogQuery {
  userId: number;
  query: string;
  sort: "relevance" | "publishedAt" | "matchedAt";
  order: "asc" | "desc";
  limit: number;
  cursor?: string;
  topicId?: string;
  publishedFrom?: string;
  publishedTo?: string;
  author?: string;
}

export interface SearchResultRow {
  id: string;
  primarySource: string;
  sourcePaperId: string;
  title: string;
  abstract: string;
  authors: unknown;
  sourceUrl: string;
  publishedAt: Date;
  score: number;
  matchedAt: Date;
  topicId: string;
  topicName: string;
}

export interface PaperAccessibleRow {
  paper: Paper;
  summary: PaperSummary | null;
}

export const paperRepository = {
  findById(id: string): Promise<Paper | null> {
    return prisma.paper.findUnique({ where: { id } });
  },

  findBySource(primarySource: string, sourcePaperId: string): Promise<Paper | null> {
    return prisma.paper.findUnique({
      where: { primarySource_sourcePaperId: { primarySource, sourcePaperId } },
    });
  },

  upsertBySource(input: UpsertPaperInput): Promise<Paper> {
    return prisma.paper.upsert({
      where: {
        primarySource_sourcePaperId: {
          primarySource: input.primarySource,
          sourcePaperId: input.sourcePaperId,
        },
      },
      update: {},
      create: {
        primarySource: input.primarySource,
        sourcePaperId: input.sourcePaperId,
        title: input.title,
        abstract: input.abstract,
        authors: input.authors as unknown as Prisma.InputJsonValue,
        sourceUrl: input.sourceUrl,
        publishedAt: input.publishedAt,
      },
    });
  },

  /**
   * Returns the paper joined to its summary if the paper is either attributed
   * to one of the user's tracked topics OR favourited by the user
   * (research.md Decision 10).
   */
  async findByIdAccessibleToUser(
    userId: number,
    paperId: string,
  ): Promise<PaperAccessibleRow | null> {
    const paper = await prisma.paper.findUnique({
      where: { id: paperId },
      include: { summary: true },
    });
    if (!paper) return null;

    const viaTopic = await prisma.topicPaperMatch.findFirst({
      where: { paperId, trackedTopic: { userId } },
      select: { id: true },
    });
    if (viaTopic) {
      const { summary, ...rest } = paper;
      return { paper: rest as Paper, summary };
    }

    const viaFavorite = await prisma.favorite.findUnique({
      where: { userId_paperId: { userId, paperId } },
      select: { id: true },
    });
    if (viaFavorite) {
      const { summary, ...rest } = paper;
      return { paper: rest as Paper, summary };
    }

    return null;
  },

  /**
   * Search the user's catalog with MySQL FULLTEXT relevance scoring.
   * The raw SQL is the only place we step outside Prisma's typed query API;
   * keep this isolated here (research.md Decision 8).
   *
   * Returns one row per (paper, attributing topic) — the service aggregates
   * matching topics per paper.
   */
  async searchByUserCatalog(query: SearchByUserCatalogQuery): Promise<SearchResultRow[]> {
    const {
      userId,
      query: q,
      sort,
      order,
      limit,
      cursor,
      topicId,
      publishedFrom,
      publishedTo,
      author,
    } = query;

    const orderClause =
      sort === "relevance"
        ? `score ${order === "asc" ? "ASC" : "DESC"}, p.publishedAt DESC, p.id ${order === "asc" ? "ASC" : "DESC"}`
        : sort === "publishedAt"
          ? `p.publishedAt ${order === "asc" ? "ASC" : "DESC"}, p.id ${order === "asc" ? "ASC" : "DESC"}`
          : `m.fetchedAt ${order === "asc" ? "ASC" : "DESC"}, p.id ${order === "asc" ? "ASC" : "DESC"}`;

    // We use parameterised positional placeholders to keep things injection-safe.
    const params: unknown[] = [q, userId];
    let where = "MATCH(p.title, p.abstract) AGAINST(? IN NATURAL LANGUAGE MODE) AND t.userId = ?";

    if (topicId !== undefined) {
      where += " AND t.id = ?";
      params.push(topicId);
    }
    if (publishedFrom !== undefined) {
      where += " AND p.publishedAt >= ?";
      params.push(new Date(publishedFrom));
    }
    if (publishedTo !== undefined) {
      where += " AND p.publishedAt <= ?";
      params.push(new Date(publishedTo));
    }
    if (author !== undefined) {
      where +=
        " AND JSON_SEARCH(LOWER(p.authors), 'one', CONCAT('%', LOWER(?), '%'), NULL, '$') IS NOT NULL";
      params.push(author);
    }
    if (cursor !== undefined) {
      where += " AND p.id > ?";
      params.push(cursor);
    }

    params.push(limit + 1);

    const sql = `
      SELECT p.id AS id,
             p.primarySource AS primarySource,
             p.sourcePaperId AS sourcePaperId,
             p.title AS title,
             p.abstract AS abstract,
             p.authors AS authors,
             p.sourceUrl AS sourceUrl,
             p.publishedAt AS publishedAt,
             MATCH(p.title, p.abstract) AGAINST(? IN NATURAL LANGUAGE MODE) AS score,
             m.fetchedAt AS matchedAt,
             t.id AS topicId,
             t.name AS topicName
      FROM Paper p
      INNER JOIN TopicPaperMatch m ON m.paperId = p.id
      INNER JOIN TrackedTopic t ON t.id = m.trackedTopicId
      WHERE ${where}
      ORDER BY ${orderClause}
      LIMIT ?
    `;

    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(sql, q, ...params);

    return rows.map((row) => ({
      id: String(row.id),
      primarySource: String(row.primarySource),
      sourcePaperId: String(row.sourcePaperId),
      title: String(row.title),
      abstract: String(row.abstract),
      authors: row.authors,
      sourceUrl: String(row.sourceUrl),
      publishedAt: row.publishedAt as Date,
      score: typeof row.score === "number" ? row.score : Number(row.score) || 0,
      matchedAt: row.matchedAt as Date,
      topicId: String(row.topicId),
      topicName: String(row.topicName),
    }));
  },
};
