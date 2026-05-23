import type { Favorite, Paper, PaperSummary } from "@prisma/client";

import { prisma } from "../db.js";

export interface FavoriteWithPaper {
  favorite: Favorite;
  paper: Paper | null;
  summary: PaperSummary | null;
}

export interface ListFavoritesWithPaperQuery {
  userId: number;
  limit: number;
  cursor?: string;
}

export const favoriteRepository = {
  listByUser(userId: number): Promise<Favorite[]> {
    return prisma.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },

  findByUserAndPaper(userId: number, paperId: string): Promise<Favorite | null> {
    return prisma.favorite.findUnique({
      where: { userId_paperId: { userId, paperId } },
    });
  },

  addForUser(userId: number, paperId: string): Promise<Favorite> {
    return prisma.favorite.create({
      data: { userId, paperId },
    });
  },

  async removeForUser(userId: number, paperId: string): Promise<boolean> {
    const result = await prisma.favorite.deleteMany({
      where: { userId, paperId },
    });
    return result.count > 0;
  },

  /**
   * List the user's favourites with the full `Paper` row (left-joined — older
   * `001` favourites with arbitrary paperId strings come back with `paper: null`)
   * and the `PaperSummary` row for the summary-availability indicator.
   * Cursor pagination keyed on `Favorite.id`.
   */
  async listFavoritesWithPaper(
    query: ListFavoritesWithPaperQuery,
  ): Promise<FavoriteWithPaper[]> {
    const { userId, limit, cursor } = query;

    const favorites = await prisma.favorite.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: Number(cursor) }, skip: 1 } : {}),
    });

    if (favorites.length === 0) return [];

    const paperIds = favorites.map((f) => f.paperId);
    const [papers, summaries] = await Promise.all([
      prisma.paper.findMany({ where: { id: { in: paperIds } } }),
      prisma.paperSummary.findMany({ where: { paperId: { in: paperIds } } }),
    ]);
    const paperById = new Map(papers.map((p) => [p.id, p]));
    const summaryByPaperId = new Map(summaries.map((s) => [s.paperId, s]));

    return favorites.map((favorite) => ({
      favorite,
      paper: paperById.get(favorite.paperId) ?? null,
      summary: summaryByPaperId.get(favorite.paperId) ?? null,
    }));
  },
};
