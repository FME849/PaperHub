# REST Contract: Tracked Topics

**Resource**: `TrackedTopic`
**Base path**: `/api/topics`
**Authentication**: required on every endpoint via the JWT bearer middleware from 001 (`Authorization: Bearer <jwt>`). Missing/invalid token → `401 Unauthorized`.

Common error envelope (consistent with 001):

```json
{ "error": { "code": "STRING_CODE", "message": "Human-readable message", "details": { /* optional */ } } }
```

Common error codes used across endpoints below: `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `VALIDATION_FAILED` (422), `DUPLICATE_NAME` (409), `TOPIC_LIMIT_EXCEEDED` (409), `UNKNOWN_SOURCE_FILTER` (422).

---

## `POST /api/topics` — create a tracked topic

Creates a new tracked topic owned by the authenticated user. The new topic is eligible for the **next** scheduled fetch cycle (FR-019 — no historical backfill).

### Request

```http
POST /api/topics
Authorization: Bearer <jwt>
Content-Type: application/json
```

```json
{
  "name": "Diffusion models for protein folding",
  "keywords": ["diffusion model", "protein folding", "denoising"],
  "sourceFilters": ["arxiv:cs.LG", "arxiv:q-bio.BM"]
}
```

**Field rules** (server-side via Zod; mirrors `data-model.md` validation):

| Field | Type | Rules |
|-------|------|-------|
| `name` | string | trimmed, non-empty, ≤ `MAX_TOPIC_NAME_LENGTH` (default 120) chars |
| `keywords` | string[] | length 1–`MAX_KEYWORDS_PER_TOPIC` (default 15); each trimmed, non-empty, ≤ `MAX_KEYWORD_LENGTH` (default 80) chars; duplicates de-duped server-side |
| `sourceFilters` | string[] | length 1–`MAX_FILTERS_PER_TOPIC` (default 10); each must be a recognized value from `GET /api/sources` |

### Responses

**`201 Created`** — body: the created `TrackedTopic` (see *Response shape* below). Side effects: a new `TrackedTopic` row with `lastFetchedAt = null` and `createdAt = updatedAt = now()`.

**`409 DUPLICATE_NAME`** — the user already has a topic whose name is equal (case-insensitive) to the submitted name.

```json
{ "error": { "code": "DUPLICATE_NAME", "message": "You already have a topic named \"Diffusion models for protein folding\"." } }
```

**`409 TOPIC_LIMIT_EXCEEDED`** — the user already has `MAX_TOPICS_PER_USER` topics.

```json
{ "error": { "code": "TOPIC_LIMIT_EXCEEDED", "message": "You have reached the maximum number of tracked topics (20).", "details": { "limit": 20, "current": 20 } } }
```

**`422 VALIDATION_FAILED`** — any field rule violated. `details` is a field → message map.

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "One or more fields are invalid.",
    "details": {
      "keywords": "Must contain at least one non-empty keyword.",
      "sourceFilters[1]": "Unknown source filter: arxiv:cs.ZZZ."
    }
  }
}
```

**`422 UNKNOWN_SOURCE_FILTER`** — a sourceFilter value isn't in the system catalog. (May also be surfaced inside a `VALIDATION_FAILED` `details` map.)

**`401 UNAUTHENTICATED`** — no or invalid JWT.

### Response shape (`TrackedTopic`)

```json
{
  "id": "ckxyz...",
  "name": "Diffusion models for protein folding",
  "keywords": ["diffusion model", "protein folding", "denoising"],
  "sourceFilters": ["arxiv:cs.LG", "arxiv:q-bio.BM"],
  "lastFetchedAt": null,
  "createdAt": "2026-05-18T08:30:00.000Z",
  "updatedAt": "2026-05-18T08:30:00.000Z"
}
```

`userId` is intentionally **not** included in the response — the requester already knows it's their own. Server-side, every row carries it; the JWT subject is the source of truth.

---

## `GET /api/topics` — list the requester's tracked topics

Returns every tracked topic owned by the authenticated user, in **`createdAt` descending** order by default (most recently created first). Other users' topics are never returned (FR-007 / FR-012).

### Request

```http
GET /api/topics?sort=createdAt&order=desc
Authorization: Bearer <jwt>
```

**Query parameters** (all optional):

| Param | Values | Default | Notes |
|-------|--------|---------|-------|
| `sort` | `createdAt` \| `updatedAt` \| `name` | `createdAt` | |
| `order` | `asc` \| `desc` | `desc` | |
| `limit` | integer 1–100 | 50 | Pagination cap |
| `cursor` | opaque string (last item's `id`) | — | Cursor-based pagination |

### Responses

**`200 OK`**

```json
{
  "items": [
    { "id": "ckxyz...", "name": "Diffusion models for protein folding", "keywords": [...], "sourceFilters": [...], "lastFetchedAt": "2026-05-18T03:01:23.000Z", "createdAt": "...", "updatedAt": "..." },
    ...
  ],
  "nextCursor": "ckabc..." 
}
```

`nextCursor` is omitted when there is no next page.

**`401 UNAUTHENTICATED`** — no or invalid JWT.
**`422 VALIDATION_FAILED`** — invalid query parameters.

---

## `GET /api/topics/:id` — fetch one tracked topic

### Request

```http
GET /api/topics/ckxyz...
Authorization: Bearer <jwt>
```

### Responses

**`200 OK`** — body: `TrackedTopic` shape as in POST.
**`401 UNAUTHENTICATED`** — no or invalid JWT.
**`404 NOT_FOUND`** — topic does not exist **or** belongs to a different user. We do not distinguish "not yours" from "doesn't exist," preserving the FR-007 / FR-012 privacy promise (no enumeration via timing or different status codes).

---

## `PATCH /api/topics/:id` — edit a tracked topic

Updates one or more fields. Omitted fields are unchanged. `id`, `userId`, `lastFetchedAt`, `createdAt` are not user-editable.

### Request

```http
PATCH /api/topics/ckxyz...
Authorization: Bearer <jwt>
Content-Type: application/json
```

```json
{
  "name": "Diffusion + flow matching for protein folding",
  "keywords": ["diffusion", "flow matching", "protein folding"]
}
```

**Field rules**: same as POST per field. At least one of `name`, `keywords`, `sourceFilters` MUST be provided; empty body → `422 VALIDATION_FAILED`.

### Responses

**`200 OK`** — body: the updated `TrackedTopic`. Side effect: `updatedAt = now()`. `lastFetchedAt` is **not** reset — the next cycle picks up the updated config (FR-016) and uses the existing incremental window (Decision 5).
**`401 UNAUTHENTICATED`** — no or invalid JWT.
**`404 NOT_FOUND`** — topic doesn't exist or isn't yours.
**`409 DUPLICATE_NAME`** — the new name conflicts with another of the user's topics.
**`422 VALIDATION_FAILED`** — field rules violated.

---

## `DELETE /api/topics/:id` — delete a tracked topic

Removes the `TrackedTopic` row and (via cascading FK) every `TopicPaperMatch` row scoped to that topic. **`Paper` rows are never deleted**, and other topics' `TopicPaperMatch` rows referencing the same papers are unaffected (FR-006 spec language is explicit on this).

### Request

```http
DELETE /api/topics/ckxyz...
Authorization: Bearer <jwt>
```

### Responses

**`204 No Content`** — successful delete.
**`401 UNAUTHENTICATED`** — no or invalid JWT.
**`404 NOT_FOUND`** — topic doesn't exist or isn't yours. Idempotency: a repeated DELETE on the same id returns `404` (no special "already deleted" path; the caller can treat 404 as success-after-success).

---

## Authorization summary

Every endpoint requires a valid JWT. Every endpoint that takes an `:id` path parameter filters by `userId = req.userId` at the repository layer; ownership mismatch returns `404`, never `403` (no enumeration).
