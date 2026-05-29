import { apiFetch } from "@/src/lib/api-client";
import type { AuthResponse } from "@/src/lib/api-types";

export async function registerUser(body: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function loginUser(body: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function logoutUser(): Promise<void> {
  await apiFetch<void>("/api/auth/logout", { method: "POST" });
}

export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function verifyPasswordResetToken(token: string): Promise<{ valid: boolean }> {
  return apiFetch<{ valid: boolean }>(`/api/auth/reset-password?token=${encodeURIComponent(token)}`, {
    method: "GET",
  });
}

export async function resetPassword(body: { token: string; newPassword: string }): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
