import { apiFetch } from "@/src/lib/api-client";
import type { FavoriteItem, FavoritesListResponse } from "@/src/lib/api-types";

export async function listFavorites(): Promise<FavoritesListResponse> {
  return apiFetch<FavoritesListResponse>("/api/favorites");
}

export async function addFavorite(paperId: string): Promise<FavoriteItem> {
  return apiFetch<FavoriteItem>("/api/favorites", {
    method: "POST",
    body: JSON.stringify({ paperId }),
  });
}

export async function removeFavorite(paperId: string): Promise<void> {
  return apiFetch<void>(`/api/favorites/${encodeURIComponent(paperId)}`, {
    method: "DELETE",
  });
}
