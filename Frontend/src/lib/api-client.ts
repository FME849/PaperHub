const TOKEN_KEY = "paperhub.token";

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) {
    throw new ApiError(
      0,
      "API base URL is not configured. Set NEXT_PUBLIC_API_BASE_URL in Frontend/.env.local",
    );
  }
  return base.replace(/\/$/, "");
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  const headers = new Headers(init.headers);
  if (init.body !== undefined && init.body !== null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${getBaseUrl()}${path}`, { ...init, headers });

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof body?.error === "string" ? body.error : "Request failed";
    const err = new ApiError(res.status, message, body?.details);
    if (res.status === 401 && token) {
      tokenStore.clear();
      unauthorizedHandler?.();
    }
    throw err;
  }

  return body as T;
}

export const tokenStore = {
  get: () => (typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export function fieldError(details: unknown, field: string): string | undefined {
  if (!details || typeof details !== "object") return undefined;
  const fieldErrors = (details as { fieldErrors?: Record<string, string[]> }).fieldErrors;
  const messages = fieldErrors?.[field];
  return messages?.[0];
}
