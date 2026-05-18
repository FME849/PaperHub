/** User shape returned by the backend auth & profile endpoints. */
export interface ApiUser {
  id: number;
  email: string;
  displayName: string;
  bio: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface AuthResponse {
  user: ApiUser;
  token: string;
}

export interface FavoritesListResponse {
  favorites: { paperId: string; createdAt: string }[];
}

export interface FavoriteItem {
  paperId: string;
  createdAt: string;
}
