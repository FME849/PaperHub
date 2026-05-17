# Frontend Integration Guide — Feature `001-user-auth`

**Audience**: The frontend teammate wiring the existing Next.js screens to the new backend.
**Date**: 2026-05-17
**Backend contract source of truth**: [`contracts/auth.md`](./contracts/auth.md), [`contracts/users.md`](./contracts/users.md), [`contracts/favorites.md`](./contracts/favorites.md). If anything in this doc disagrees with the contract files, the contract files win — raise a question rather than silently diverge.

This guide tells you everything you need to replace the mock-data flows in the existing auth/profile/favorites screens with real backend calls. It assumes the backend tasks T001-T038 in [`tasks.md`](./tasks.md) are done and the API is reachable at the URL you set in `NEXT_PUBLIC_API_BASE_URL`.

---

## 1. What the backend gives you

A locally-hosted Express API. To bring it up:

```bash
cd backend
docker compose up -d                # MySQL container on localhost:3306
npm install                          # one-time
npx prisma migrate dev               # one-time per machine
npm run dev                          # API on http://localhost:4000
```

Verify: `curl http://localhost:4000/healthz` → `{"ok": true}`.

If any of the above fails, the issue is on the backend side — flag it; do not try to work around it in the frontend.

---

## 2. Environment

Add to your `.env.local` at the repo root (already gitignored):

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

All API calls go through this base URL. Never hardcode `http://localhost:4000` anywhere in the frontend.

---

## 3. Token handling

The backend issues a **JWT** on register and login. The frontend stores it and attaches it to every authenticated request.

**Storage**: `localStorage` under the key `paperhub.token`.

> ⚠️ This is **intentionally simple** for this iteration (see `research.md` Decision 12). Do **not** upgrade it to HTTP-only cookies / SSR token plumbing in this PR — a follow-up hardening pass will do that against an updated backend. Adding cookies now would break the backend's CORS configuration (`credentials: false`).

**Attach on every request**: `Authorization: Bearer <token>`. Missing token on a protected endpoint produces a `401 { "error": "Authentication required." }`.

**On `401`** from any authenticated endpoint: clear the token from `localStorage`, drop the in-memory user, and route to `/auth/login`. This handles token expiry without special-casing it.

**On logout**:

1. `POST /api/auth/logout` (you can ignore the response — it's always `204`).
2. Delete `paperhub.token` from `localStorage`.
3. Drop the in-memory user.
4. Route to `/auth/login`.

The server-side call in step 1 is currently a no-op but it's part of the contract and keeps the call sites symmetric for the upcoming hardening pass.

---

## 4. Recommended API client

A single fetch wrapper keeps token attachment, error shape, and 401 handling in one place. Suggested shape (TypeScript, framework-neutral):

```ts
// e.g. src/lib/api-client.ts (final location is your call as part of the reorg)
const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL!;
const TOKEN_KEY = "paperhub.token";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      res.status,
      typeof body?.error === "string" ? body.error : "Request failed",
      body?.details,
    );
  }
  return body as T;
}

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};
```

Then catch `ApiError` at call sites; when `err.status === 401`, run the logout sequence.

---

## 5. Common error response shape

Every error response from the backend has this shape (`research.md` Decision 14):

```json
{ "error": "human-readable message", "details": { /* optional, Zod issue list on 400 */ } }
```

Status code conventions you'll see:

| Status | Meaning | What to show |
|--------|---------|--------------|
| `400` | Validation failure | Inline field errors from `details` (Zod `flatten()` output: `{ formErrors, fieldErrors }`). |
| `401` | Auth required / bad credentials / wrong current password | Generic message — never differentiate "no such user" vs "wrong password" in the UI. |
| `404` | Resource not found (currently only `DELETE /api/favorites/:paperId` for an unrecorded paper) | A toast / inline message. |
| `409` | Email already registered | Inline form error on the email field. |
| `500` | Internal | Generic "Something went wrong, please try again." Do **not** display `err.message` — the backend strips internal detail but stay defensive. |

---

## 6. Endpoint quick reference

All paths are relative to `NEXT_PUBLIC_API_BASE_URL`. Auth column: `none` = no token; `bearer` = requires `Authorization: Bearer <jwt>`. Full request/response shapes live in [`contracts/`](./contracts/).

### Auth — [`contracts/auth.md`](./contracts/auth.md)

| Method | Path | Auth | Body | Success | Error cases |
|--------|------|------|------|---------|-------------|
| `POST` | `/api/auth/register` | none | `{ email, password, displayName? }` | `201` `{ user, token }` | `400` validation, `409` duplicate email |
| `POST` | `/api/auth/login` | none | `{ email, password }` | `200` `{ user, token }` | `400` missing fields, `401` invalid credentials (generic message) |
| `POST` | `/api/auth/logout` | bearer (optional in practice) | — | `204` | (never errors) |

### Users / Profile — [`contracts/users.md`](./contracts/users.md)

| Method | Path | Auth | Body | Success | Error cases |
|--------|------|------|------|---------|-------------|
| `GET` | `/api/users/me` | bearer | — | `200` user | `401` |
| `PATCH` | `/api/users/me` | bearer | `{ displayName?, bio? }` (≥1 field required; send `bio: null` to clear) | `200` updated user | `400` validation, `401` |
| `POST` | `/api/users/me/password` | bearer | `{ currentPassword, newPassword }` | `204` | `400` weak/duplicate new password, `401` wrong current password ("Invalid current password.") |

### Favorites — [`contracts/favorites.md`](./contracts/favorites.md)

| Method | Path | Auth | Body | Success | Error cases |
|--------|------|------|------|---------|-------------|
| `GET` | `/api/favorites` | bearer | — | `200` `{ favorites: [{ paperId, createdAt }] }` | `401` |
| `POST` | `/api/favorites` | bearer | `{ paperId }` | `201` newly created OR `200` already-favorited (same body shape either way) | `400` invalid `paperId`, `401` |
| `DELETE` | `/api/favorites/:paperId` | bearer | — | `204` | `401`, `404` not in favorites |

---

## 7. Validation rules to mirror in the UI

Mirror these client-side for fast feedback, but **always** rely on the server response for correctness — never block submission on rules the server doesn't enforce, and never trust the client to skip server validation.

- **Email**: standard email shape, max 254 chars. Trim before send. The backend lowercases server-side, so casing of user input doesn't matter for uniqueness.
- **Password** (registration + password change `newPassword`): min 8 chars; must contain at least one letter and one digit.
- **Display name**: 1-80 chars after trim. Whitespace-only is rejected. On registration, omitting the field is fine — the backend defaults it to the local part of the email.
- **Bio**: max 500 chars after trim. Send `null` to clear an existing bio.
- **Paper ID** (favorite): matches `^[A-Za-z0-9.\-/]{3,64}$`. Arbitrary user-typed input should be trimmed before validating.

The exact strength rule message text and Zod error keys come back in `details.fieldErrors` on `400` — surface them inline next to the offending field.

---

## 8. Mapping existing screens to endpoints

Verified file inventory as of 2026-05-17 (your reorg may move these — re-resolve paths after that, but the screen-to-endpoint mapping stays):

| Screen | Render entrypoint | Backed by | Endpoints to call | State to update |
|--------|--------------------|-----------|-------------------|-----------------|
| Register | `src/pages/auth/register.tsx` → `src/screens/Register.tsx` | `AppStateContext` (mock) | `POST /api/auth/register` | Store `token` via `tokenStore.set`, set `user` in context, route to `/` (or whatever the post-auth landing is). |
| Login | `src/pages/auth/login.tsx` → `src/screens/Login.tsx` | `AppStateContext` (mock) | `POST /api/auth/login` | Same as register. On `401`, show the backend's generic message — do not split it into separate "no such user" / "wrong password" branches. |
| Forgot password | `src/pages/auth/forgot-password.tsx` → `src/screens/ForgotPassword.tsx` | mock | **Out of scope** for this feature. Leave as-is or stub a "coming soon" notice — password reset is deferred per spec Assumptions. |
| Profile (view + edit + password change) | (no dedicated page yet — add as part of the reorg, e.g. `src/pages/profile.tsx` → new `src/screens/Profile.tsx`) | new | `GET /api/users/me`, `PATCH /api/users/me`, `POST /api/users/me/password` | After PATCH, replace the in-context user with the response body. After password change, you can leave the current token active — the backend does not invalidate sessions on password change in this iteration (see `research.md` Decision 3 and Simplifications). |
| Favorites list | `src/pages/favorites.tsx` → `src/screens/Favorites.tsx` | mock | `GET /api/favorites`, `DELETE /api/favorites/:paperId` | Render the list; on remove, optimistically drop the row and reconcile against the response. |
| Favorite toggle on a paper detail | `src/pages/papers/[id].tsx` → `src/screens/PaperDetail.tsx` | mock | `POST /api/favorites` to add. (No "GET favorites?paperId=" — to know the current state, either keep a local set sourced from `GET /api/favorites` on app load, or rely on `POST` returning `200` vs `201` to detect already-favorited.) | Maintain a `Set<string>` of favorited paper IDs in `AppStateContext`. |
| Header / logout control | `src/components/layout/Header.tsx` | `AppStateContext` | `POST /api/auth/logout` (then local cleanup per §3) | Clear context user + token. |

**Removing favorites**: there is no endpoint to remove "all" favorites. Only `DELETE /api/favorites/:paperId`.

**Re-favoriting the same paper**: idempotent. `POST /api/favorites` with an existing paper returns `200` (instead of `201`) and does not duplicate. Treat both statuses as success.

---

## 9. AppStateContext considerations

The current `src/state/AppStateContext.tsx` is mock-backed (`src/mockData.ts`). After the reorg, it should expose at minimum:

- `user: User | null`
- `token: string | null`
- `loading: boolean` (true on initial hydration so protected pages can avoid a flash of unauthenticated content)
- `favorites: Set<string>` (optional but useful — see paper-detail mapping above)
- `login(token, user)`, `logout()`, `refreshUser()`, `setFavorites(...)` actions

On mount: if `tokenStore.get()` returns a value, call `GET /api/users/me` to hydrate the user. On a `401` from that hydration call, clear the token and treat the user as logged out. Then flip `loading` to false.

Pages that require authentication should render a skeleton (or your existing loading state) while `loading` is true, then either render content (user present) or redirect (`next/router`'s `replace` to `/auth/login`).

---

## 10. Things to NOT implement in this PR

The backend does not support these yet, and adding frontend code that pretends it does will be misleading:

- **Token refresh / silent re-auth.** No refresh endpoint exists. On token expiry, the user logs back in.
- **Server-side logout / token revocation.** `POST /api/auth/logout` is a no-op; local cleanup is the entire effect.
- **Session-fan-out invalidation on password change.** Other devices keep their tokens until expiry. Do **not** add UI that claims "this will sign you out everywhere."
- **HTTP-only cookies / CSRF tokens.** Backend CORS is `credentials: false`. Stay with localStorage + Bearer headers.
- **Live "is this paper still available?" checks before favoriting.** Backend stores the paperId opaquely; existence will be validated when MVP feature #4 (paper storage) lands.
- **Password reset / email change / MFA / email verification.** Out of spec scope.
- **Rate-limit feedback (e.g., "try again in N seconds").** No rate limiting on the backend yet.

When any of those become real, a follow-up spec will update this guide.

---

## 11. Folder reorg alignment

The constitution mandates `/frontend` for the Next.js app. The current layout (Next.js at repo root) is a documented deviation (`plan.md` Complexity Tracking row 1). Your reorg PR is the natural moment to fix this. When you move files:

- Update `NEXT_PUBLIC_API_BASE_URL` consumption — should still work since `next.config` reads env from the new app root.
- Update `tsconfig.json` paths if you introduce `@/` aliases.
- Update `package.json` scripts and any root-level imports.
- Update `CLAUDE.md` and `README.md` references to file paths.
- Update the `Project Structure` block in `plan.md` of this feature so future agents see the new layout.

Do that as its own PR if possible (reorg first, then API wiring) — it keeps the auth/integration diff readable.

---

## 12. Smoke checklist before opening the integration PR

Tick these by hand with `npm run dev` (frontend) and `cd backend && npm run dev` (backend) both running:

- [ ] Register a brand-new account in the UI → land on the post-auth home; refresh the page → still logged in.
- [ ] Log out → `paperhub.token` removed from `localStorage`; protected routes redirect to `/auth/login`.
- [ ] Log in with the just-created account → land on the post-auth home.
- [ ] Try to register again with the same email (any casing) → inline error from the email field, no crash.
- [ ] Try to log in with the wrong password → generic "Invalid email or password." inline, no leak of which field was wrong.
- [ ] Visit `/profile` (or wherever you put it), edit `displayName` → success; refresh → value persists.
- [ ] Change password with the wrong current password → "Invalid current password." surfaced; data unchanged.
- [ ] Change password correctly → success; subsequent requests still authorized with the same token (no forced logout in this iteration).
- [ ] Favorite a paper from the paper detail screen → appears in `/favorites`; re-favorite the same paper → no duplicate.
- [ ] Remove a favorite → disappears from the list.
- [ ] Manually expire the token (delete `paperhub.token` then make an authenticated request) → routed to login automatically.
- [ ] Browser network tab: every authenticated request has `Authorization: Bearer ...`; no calls go to a hardcoded host.

If any item fails because the backend behaves differently from this guide, fix the doc and the contract file — do not patch the frontend around the backend.

---

## 13. Where to ask questions

- **Behavior questions** (what should happen when X): re-read `spec.md` and `contracts/*.md`; if still unclear, open a `[NEEDS CLARIFICATION]` thread on the spec.
- **Technical decisions** already made: see `research.md`.
- **Why something was deferred**: see `research.md` "Simplifications" table and `plan.md` Complexity Tracking.
- **Backend bugs** (the API does not match the contract): file against the backend; do not patch in the frontend.
