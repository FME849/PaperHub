import type { Favorite } from "@prisma/client";

import { prisma } from "../db.js";
import { NotFoundError, UnknownPaperError } from "../errors.js";
import {
  favoriteRepository,
  type FavoriteWithPaper,
} from "../repositories/favorite.repository.js";
import type { FavoritesPapersQuery } from "../validation/schemas.js";

export interface PublicFavorite {
  paperId: string;
  createdAt: string;
}

export interface AddFavoriteResult {
  favorite: PublicFavorite;
  created: boolean;
}

export interface FavoritePaperItem {
  favoritedAt: string;
  paper:
    | {
        id: string;
        primarySource: string;
        sourcePaperId: string;
        title: string;
        abstractExcerpt: string;
        authors: string[];
        sourceUrl: string;
        publishedAt: string;
      }
    | null;
  summaryAvailable: boolean;
  topics: Array<{ id: string; name: string }>;
  inCatalog: boolean;
}

export interface ListFavoritePapersResult {
  items: FavoritePaperItem[];
  nextCursor?: string;
}

const ABSTRACT_EXCERPT_LENGTH = 280;

function toPublic(favorite: Favorite): PublicFavorite {
  return {
    paperId: favorite.paperId,
    createdAt: favorite.createdAt.toISOString(),
  };
}

function toJsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function excerpt(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n).replace(/\s+\S*$/, "") + "…";
}

function isPrismaUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return code === "P2002";
}

/**
 * FR-024: at the moment of bookmarking, the paperId must reference a Paper
 * row currently attributed to one of the user's tracked topics.
 */
async function assertPaperInUserCatalog(userId: number, paperId: string): Promise<void> {
  const row = await prisma.topicPaperMatch.findFirst({
    where: { paperId, trackedTopic: { userId } },
    select: { id: true },
  });
  if (!row) throw new UnknownPaperError();
}

function toItem(row: FavoriteWithPaper, topics: Array<{ id: string; name: string }>): FavoritePaperItem {
  const paper = row.paper;
  return {
    favoritedAt: row.favorite.createdAt.toISOString(),
    paper: paper
      ? {
          id: paper.id,
          primarySource: paper.primarySource,
          sourcePaperId: paper.sourcePaperId,
          title: paper.title,
          abstractExcerpt: excerpt(paper.abstract, ABSTRACT_EXCERPT_LENGTH),
          authors: toJsonStringArray(paper.authors),
          sourceUrl: paper.sourceUrl,
          publishedAt: paper.publishedAt.toISOString(),
        }
      : null,
    summaryAvailable: row.summary?.status === "SUCCEEDED",
    topics,
    inCatalog: topics.length > 0,
  };
}

export const favoritesService = {
  async list(userId: number): Promise<PublicFavorite[]> {
    const rows = await favoriteRepository.listByUser(userId);
    return rows.map(toPublic);
  },

  async add(userId: number, paperId: string): Promise<AddFavoriteResult> {
    await assertPaperInUserCatalog(userId, paperId);

    const existing = await favoriteRepository.findByUserAndPaper(userId, paperId);
    if (existing) {
      return { favorite: toPublic(existing), created: false };
    }
    try {
      const created = await favoriteRepository.addForUser(userId, paperId);
      return { favorite: toPublic(created), created: true };
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        const racing = await favoriteRepository.findByUserAndPaper(userId, paperId);
        if (racing) {
          return { favorite: toPublic(racing), created: false };
        }
      }
      throw err;
    }
  },

  async remove(userId: number, paperId: string): Promise<void> {
    const removed = await favoriteRepository.removeForUser(userId, paperId);
    if (!removed) {
      throw new NotFoundError("Favorite not found.");
    }
  },

  async listFavoritePapersWithDetails(
    userId: number,
    query: FavoritesPapersQuery,
  ): Promise<ListFavoritePapersResult> {
    const rows = await favoriteRepository.listFavoritesWithPaper({
      userId,
      limit: query.limit,
      cursor: query.cursor,
    });

    let nextCursor: string | undefined;
    if (rows.length > query.limit) {
      const last = rows[query.limit - 1];
      if (last) nextCursor = String(last.favorite.id);
      rows.length = query.limit;
    }

    // Per-row: the user's current topics that fetched this paper.
    const items = await Promise.all(
      rows.map(async (row) => {
        const topicRows = await prisma.topicPaperMatch.findMany({
          where: { paperId: row.favorite.paperId, trackedTopic: { userId } },
          select: { trackedTopic: { select: { id: true, name: true } } },
        });
        const topics = topicRows
          .map((r) => r.trackedTopic)
          .filter((t): t is { id: string; name: string } => t !== null);
        return toItem(row, topics);
      }),
    );

    return {
      items,
      ...(nextCursor !== undefined ? { nextCursor } : {}),
    };
  },
};
