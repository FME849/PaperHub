import type { Favorite } from "@prisma/client";

import { prisma } from "../db.js";

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
};
