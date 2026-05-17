import type { Favorite } from "@prisma/client";

import { NotFoundError } from "../errors.js";
import { favoriteRepository } from "../repositories/favorite.repository.js";

export interface PublicFavorite {
  paperId: string;
  createdAt: string;
}

export interface AddFavoriteResult {
  favorite: PublicFavorite;
  created: boolean;
}

function toPublic(favorite: Favorite): PublicFavorite {
  return {
    paperId: favorite.paperId,
    createdAt: favorite.createdAt.toISOString(),
  };
}

function isPrismaUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return code === "P2002";
}

export const favoritesService = {
  async list(userId: number): Promise<PublicFavorite[]> {
    const rows = await favoriteRepository.listByUser(userId);
    return rows.map(toPublic);
  },

  async add(userId: number, paperId: string): Promise<AddFavoriteResult> {
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
};
