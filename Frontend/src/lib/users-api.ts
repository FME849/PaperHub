import { apiFetch } from "@/src/lib/api-client";
import type { ApiUser } from "@/src/lib/api-types";

export async function getCurrentUser(): Promise<ApiUser> {
  return apiFetch<ApiUser>("/api/users/me");
}

export async function updateProfile(body: {
  displayName?: string;
  bio?: string | null;
}): Promise<ApiUser> {
  return apiFetch<ApiUser>("/api/users/me", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function changePassword(body: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  return apiFetch<void>("/api/users/me/password", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
