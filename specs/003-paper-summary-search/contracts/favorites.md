# REST Contract: Favourites (Extended)

**Resource**: the requesting user's bookmarks. Originally introduced by `001-user-auth`; this feature extends the surface with a richer list endpoint (`GET /api/favorites/papers`) and refines the semantics of the existing add/remove paths to enforce the "in catalog at time of bookmark" check (FR-024).
**Base path**: `/api/favorites`
**Authentication**: required (JWT bearer). Missing/invalid → `401 Unauthorized`.

What this contract changes vs `001`:

- The existing `POST /api/favorites` / `DELETE /api/favorites/:paperId` / `GET /api/favorites` endpoints stay backwards-compatible at the HTTP layer.
- `POST /api/favorites` now additionally validates that `paperId` matches a `Paper` row attributed to one of the requesting user's tracked topics (FR-024). Attempts to favourite a paper outside the catalog are rejected.
- A **new** endpoint `GET /api/favorites/papers` returns the user's favourites joined to full `Paper` metadata, summary state, and current-topic context — suitable for rendering the "Favourites" list view (US4 scenario 2).

The existing `GET /api/favorites` from `001` (returning the bare `(paperId, createdAt)` shape) remains available for backwards-compatibility with whatever `001` clients exist. New FE work should use `GET /api/favorites/papers`.

---

## `POST /api/favorites` — bookmark a paper

### Request

```http
POST /api/favorites
Authorization: Bearer <jwt>
Content-Type: application/json
```

```json
{ "paperId": "ckabc..." }
```

`paperId` MUST match a `Paper.id` (cuid) of a paper currently attributed to one of the requesting user's tracked topics (FR-024).

### Responses

**`201 Created`** — newly bookmarked. Body returns the bare favourite shape from `001` for backwards-compat:

```json
{ "paperId": "ckabc...", "createdAt": "2026-05-23T08:30:00.000Z" }
```

**`200 OK`** — paper was already bookmarked (idempotent). Same body shape.

**`400 VALIDATION_FAILED`** — `paperId` is missing or empty.

**`404 NOT_FOUND`** — `paperId` does not match any `Paper` in the requesting user's catalog at this moment. The error message does NOT distinguish "paper doesn't exist" from "you don't have access" (FR-024 + enumeration resistance).

```json
{ "error": "Paper not found in your catalog." }
```

**`401 AUTH_REQUIRED`** — no / invalid JWT.

---

## `DELETE /api/favorites/:paperId` — unbookmark a paper

Existing endpoint from `001`. Behaviour unchanged. Returns `204 No Content` on success, `404 NOT_FOUND` if the paper was not bookmarked. Idempotent on repeat.

---

## `GET /api/favorites` — bare list (from `001`, unchanged)

Returns the user's favourites as `(paperId, createdAt)` only, ordered by `createdAt` descending. Kept for backwards-compatibility.

```json
{ "favorites": [ { "paperId": "ckabc...", "createdAt": "2026-05-23T08:30:00.000Z" } ] }
```

---

## `GET /api/favorites/papers` — favourites with full paper detail (NEW in this feature)

Returns each of the user's favourites joined to full `Paper` metadata, summary availability, and (where applicable) the user's current topics that fetched the paper. This is the endpoint the FE favourites page renders.

### Request

```http
GET /api/favorites/papers?limit=50
Authorization: Bearer <jwt>
```

**Query parameters**:

| Param | Values | Default | Notes |
|-------|--------|---------|-------|
| `limit` | integer 1–100 | 50 | |
| `cursor` | opaque string | — | Cursor pagination (last seen `Favorite.id`). |

### Responses

**`200 OK`** — body:

```json
{
  "items": [
    {
      "favoritedAt": "2026-05-23T08:30:00.000Z",
      "paper": {
        "id": "ckabc...",
        "primarySource": "arxiv",
        "sourcePaperId": "2403.04102",
        "title": "Score-based diffusion for ...",
        "abstractExcerpt": "We present ... (truncated)",
        "authors": ["Alice Smith", "Bob Jones"],
        "sourceUrl": "https://arxiv.org/abs/2403.04102",
        "publishedAt": "2026-05-17T20:14:00.000Z"
      },
      "summaryAvailable": true,
      "topics": [                              // The user's CURRENT topics that fetch this paper
        { "id": "ck...", "name": "Diffusion models for protein folding" }
      ],
      "inCatalog": true                        // false if the user has no current topic for this paper
    }
  ],
  "nextCursor": "..."
}
```

### Three favourite-row states (per Decision 10)

| Row state | `paper` | `topics` | `inCatalog` | UI rendering hint |
|---|---|---|---|---|
| Paper exists, attributed to ≥ 1 of user's current topics | Full `Paper` object | One or more topic chips | `true` | Normal card. |
| Paper exists, attributed to no current topic of the user's | Full `Paper` object | `[]` | `false` | Card with a "no current topic" annotation. The bookmark persists (per Q4 = A); clicking it still opens the detail view. |
| `Favorite.paperId` does not match any `Paper` row (legacy `001` favourite with an arbitrary string) | `null` (only `id` echoed for navigation) | `[]` | `false` | "Metadata unavailable" card; unbookmark control still works. |

The server always returns `items` ordered by `Favorite.createdAt` descending (US4 scenario 2).

**`401 AUTH_REQUIRED`** — no / invalid JWT.

**`400 VALIDATION_FAILED`** — `limit` out of range.

---

## Authorization summary

JWT required. Every operation filters by `userId = req.userId` at the repository layer. A user can never see, add, or remove another user's favourites.
