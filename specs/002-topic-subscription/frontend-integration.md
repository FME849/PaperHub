# Frontend Integration Guide: Tracked Research Topics

**Audience**: frontend engineer integrating against the `002-topic-subscription` backend.
**Status**: as-built — reflects what the backend actually returns, not the planning contract. Where this doc and `contracts/*.md` disagree, **this doc wins**.

---

## 1. Quick orientation

- Base URL (dev): `http://localhost:4000`
- All endpoints require **JWT bearer auth** inherited from `001-user-auth` — `Authorization: Bearer <token>` on every request, including `GET /api/sources`.
- Content type: `application/json` on every request that has a body.
- No CORS surprises — server allows `http://localhost:3000` by default (configurable via `CORS_ORIGIN`).

What ships in v1 (this scope):

- Source catalog (1 endpoint, read-only).
- Topic CRUD (5 endpoints).
- Per-topic fetched papers (1 endpoint).

What **does NOT** ship in v1 (don't build UI for it):

- No on-demand "Refresh now" — fetches are server-scheduled. The button doesn't exist.
- No notifications / digest emails.
- No sharing topics between users.
- No keyword suggestions / autocomplete.
- No `FetchCycle` REST endpoint (operator inspects DB directly).

---

## 2. Auth flow (recap from 001)

You should already have this from 001's integration. Summarized for completeness:

| Endpoint | Body | Returns |
|---|---|---|
| `POST /api/auth/register` | `{ email, password, displayName? }` | `{ user, token }` |
| `POST /api/auth/login` | `{ email, password }` | `{ user, token }` |

`user.id` is a **number** (not a string/cuid). Topics returned from the API never include `userId` — the requester always owns what they see.

Persist `token` and attach it to every topic/papers/sources request:

```ts
const res = await fetch(`${API_BASE}/api/topics`, {
  headers: { Authorization: `Bearer ${token}` },
});
```

---

## 3. Error envelope (read this before the endpoint reference)

Every error response — Zod validation, ownership 404, duplicate name, auth missing, server crash — uses this shape:

```ts
type ErrorResponse = {
  error: string;            // human-readable message
  details?: unknown;        // present only for VALIDATION_FAILED
};
```

There is **no machine-readable `code` field** on the wire. The frontend distinguishes errors by **HTTP status code** plus, for 422 / 409, the `error` string.

### Status code → meaning table

| HTTP | When | Frontend handling |
|---|---|---|
| 200 | GET / PATCH success | Normal success path. |
| 201 | POST topic success | Show the new topic in the list. |
| 204 | DELETE success | Remove the topic from local state. No body. |
| 400 | Validation failed (Zod) — bad field shape, length, regex, or unknown source filter | Show field-level errors from `details.fieldErrors`. |
| 401 | No/invalid/expired JWT | Redirect to login. |
| 404 | Topic missing or owned by another user | "Topic not found." Don't distinguish from "not yours." |
| 409 | `"You already have a topic named ..."` → duplicate name. `"You have reached the maximum number of tracked topics (20)."` → per-user cap. | Show inline error on the name field (for duplicates) or a banner. |
| 422 | Unknown source filter that slipped past frontend validation (rare — Zod catches this as 400 in practice; 422 is reserved for non-Zod paths) | Treat as a validation failure. |
| 5xx | Backend or arXiv hiccup | "Something went wrong. Try again." |

### Validation error shape (status 400)

```json
{
  "error": "Validation failed.",
  "details": {
    "formErrors": [],
    "fieldErrors": {
      "keywords": ["At least one keyword is required."],
      "sourceFilters": ["Source filter is not recognized."]
    }
  }
}
```

`details` is the Zod `flatten()` output. `fieldErrors` keys are the field names from the schema; values are arrays of messages. Render messages next to the matching input.

---

## 4. The source catalog (call this once)

### `GET /api/sources`

Returns the authoritative list of sources and their filter values. **The frontend MUST NOT hardcode arXiv category codes** — the backend will reject any filter value not in this list.

```json
{
  "sources": [
    {
      "id": "arxiv",
      "displayName": "arXiv",
      "filterKey": "category",
      "filterValues": [
        { "value": "arxiv:cs.AI", "displayName": "Artificial Intelligence" },
        { "value": "arxiv:cs.LG", "displayName": "Machine Learning" },
        { "value": "arxiv:cs.CL", "displayName": "Computation and Language" },
        { "value": "arxiv:q-bio.BM", "displayName": "Biomolecules" }
        // ... 155 entries total
      ]
    }
  ]
}
```

When the user creates / edits a topic, send back the `value` strings (e.g., `"arxiv:cs.LG"`) — **not** the display names, not the raw category code without the `arxiv:` prefix.

**Caching**: safe to cache for the session lifetime. The catalog only changes on backend deploy. There are no `Cache-Control` headers in v1.

---

## 5. Tracked topic CRUD

### `POST /api/topics` — create

Request body:
```ts
{
  name: string;            // 1–120 chars, trimmed
  keywords: string[];      // 1–15 entries, each 1–80 chars, trimmed
  sourceFilters: string[]; // 1–10 entries, each must match `GET /api/sources` values
}
```

Success (201) returns the `TrackedTopic` shape (see §7).

Failure cases:

| Status | When |
|---|---|
| 400 | Any field rule violated — empty name, no keywords, no filters, unknown filter value, over-length, etc. `details.fieldErrors` tells you which fields. |
| 409 | Duplicate name (case-insensitive) — error message starts with `"You already have a topic named "`. |
| 409 | Per-user topic cap reached — error message starts with `"You have reached the maximum number of tracked topics"`. |
| 401 | Missing/invalid token. |

**Side effects**: the topic becomes eligible for the **next** scheduled fetch cycle (~daily). No backfill — the topic's `lastFetchedAt` is `null` until that first cycle completes.

### `GET /api/topics` — list current user's topics

Query params (all optional):

| Param | Values | Default |
|---|---|---|
| `sort` | `createdAt` \| `updatedAt` \| `name` | `createdAt` |
| `order` | `asc` \| `desc` | `desc` |
| `limit` | 1–100 | 50 |
| `cursor` | opaque string from previous `nextCursor` | — |

Response (200):
```json
{
  "items": [ /* TrackedTopic[] */ ],
  "nextCursor": "ckxyz..."   // omitted when this is the last page
}
```

Use `nextCursor` as-is; stop paginating when it's absent.

### `GET /api/topics/:id` — fetch one

Returns the `TrackedTopic` shape on 200. Returns `404` if the topic doesn't exist **or** belongs to another user — the two cases are intentionally indistinguishable.

### `PATCH /api/topics/:id` — edit

Partial update. Request body — provide at least one of:

```ts
{
  name?: string;
  keywords?: string[];
  sourceFilters?: string[];
}
```

Same field rules as POST. Empty body → 400.

Success (200) returns the full updated `TrackedTopic`. `lastFetchedAt` is **not** reset by editing; the next cycle uses the new config but the same incremental window.

Failure cases mirror POST, plus `404` if the topic isn't yours / doesn't exist.

### `DELETE /api/topics/:id`

Success: **204 No Content** (no body). Removes the topic and all of its `TopicPaperMatch` rows. Other users' / other topics' matches on the same papers are untouched; `Paper` rows are never deleted.

Failure: `404` if missing or not yours. A second DELETE on the same id returns `404` — treat that as "already gone."

---

## 6. Per-topic fetched papers

### `GET /api/topics/:topicId/papers`

Query params (all optional):

| Param | Values | Default |
|---|---|---|
| `sort` | `publishedAt` \| `fetchedAt` | `publishedAt` |
| `order` | `asc` \| `desc` | `desc` |
| `limit` | 1–100 | 50 |
| `cursor` | opaque string | — |

Response (200):

```json
{
  "topic": {
    "id": "cmpdsi58n0001s8edlfgfw4wy",
    "name": "LLM agents v2",
    "lastFetchedAt": "2026-05-20T08:18:27.499Z"
  },
  "items": [
    {
      "id": "cmpdsi7g3000a37wc...",        // Paper.id (internal)
      "primarySource": "arxiv",
      "sourcePaperId": "2605.20179",       // version-stripped arXiv id
      "title": "TIDE: Efficient and Lossless MoE Diffusion LLM Inference...",
      "abstract": "Diffusion Large Language Models (dLLMs)...",
      "authors": ["Zhiben Chen", "Youpeng Zhao", "Yang Sui", "Jun Wang", "Yuzhang Shang"],
      "sourceUrl": "https://arxiv.org/abs/2605.20179v1",
      "publishedAt": "2026-05-19T17:59:08.000Z",
      "matchedAt": "2026-05-20T08:18:34.076Z"
    }
    // ...
  ],
  "nextCursor": "..."
}
```

### Empty-state rules (important)

Both shapes are legitimate "no items" responses; render differently:

| `items.length` | `topic.lastFetchedAt` | Frontend renders |
|---|---|---|
| 0 | `null` | "We'll start watching arXiv for this topic on the next scheduled cycle." (i.e., the topic was created but has never been through a cycle yet — FR-019, FR-023) |
| 0 | non-null | "No new papers in this cycle's window. Check back tomorrow." (the cycle ran but found nothing) |
| > 0 | non-null | The list. |

### Other behaviour

- **Cross-topic dedup is per-topic, not global**: the same paper can appear under multiple topics that the same user owns. Each topic's list is independent.
- **Cursor pagination**: opaque. Don't decode it. Stop when `nextCursor` is absent.
- **Sort default matches the spec**: reverse-chronological by `publishedAt`. UI doesn't need to set query params for the common case.
- `sourceUrl` is the canonical abstract page (it may include a version suffix like `v1`; that's fine to link to).

---

## 7. TypeScript types (copy-paste)

```ts
// ----- shared -----
export interface ErrorResponse {
  error: string;
  details?: {
    formErrors?: string[];
    fieldErrors?: Record<string, string[]>;
  };
}

// ----- sources -----
export interface SourceFilterValue {
  value: string;          // e.g., "arxiv:cs.LG"
  displayName: string;    // e.g., "Machine Learning"
}

export interface Source {
  id: string;             // "arxiv"
  displayName: string;    // "arXiv"
  filterKey: string;      // "category" (informational only)
  filterValues: SourceFilterValue[];
}

export interface GetSourcesResponse {
  sources: Source[];
}

// ----- topics -----
export interface TrackedTopic {
  id: string;
  name: string;
  keywords: string[];
  sourceFilters: string[];
  lastFetchedAt: string | null;   // ISO-8601 or null until first successful cycle
  createdAt: string;              // ISO-8601
  updatedAt: string;              // ISO-8601
}

export interface CreateTopicRequest {
  name: string;
  keywords: string[];
  sourceFilters: string[];
}

export interface UpdateTopicRequest {
  name?: string;
  keywords?: string[];
  sourceFilters?: string[];
}

export interface ListTopicsResponse {
  items: TrackedTopic[];
  nextCursor?: string;
}

// ----- papers -----
export interface TopicPaper {
  id: string;
  primarySource: string;      // "arxiv"
  sourcePaperId: string;      // version-stripped arXiv id
  title: string;
  abstract: string;
  authors: string[];
  sourceUrl: string;          // canonical abstract page (may include version suffix)
  publishedAt: string;        // ISO-8601
  matchedAt: string;          // ISO-8601 — when the cycle attributed this paper
}

export interface TopicPapersResponse {
  topic: {
    id: string;
    name: string;
    lastFetchedAt: string | null;
  };
  items: TopicPaper[];
  nextCursor?: string;
}
```

---

## 8. Limits the frontend should mirror

These match the server-side defaults. They're env-overridable on the backend, so don't rely on the numbers; the rules are the contract.

| Limit | Default | Server env var |
|---|---|---|
| Max topics per user | 20 | `MAX_TOPICS_PER_USER` |
| Max keywords per topic | 15 | `MAX_KEYWORDS_PER_TOPIC` |
| Max source filters per topic | 10 | `MAX_FILTERS_PER_TOPIC` |
| Max characters per keyword | 80 | `MAX_KEYWORD_LENGTH` |
| Max characters per topic name | 120 | `MAX_TOPIC_NAME_LENGTH` |

Suggested UX:

- Enforce these in the form (counter under each field, disable submit at the cap).
- Even if you enforce on the client, **still handle 400/409** from the server — limits can be tightened by env, and concurrent edits can race past the count check.
- When the user types a keyword, just trim + dedupe; don't lowercase (server preserves casing). When they enter a source filter, the value must come from `GET /api/sources` — render a picker, not a free-text input.

---

## 9. Suggested UX rhythms

- **First time the topics page loads**: fetch `GET /api/sources` and `GET /api/topics` in parallel. Cache sources in app state for the session.
- **After successful create / edit / delete**: optimistic update + refetch the list (cheap — `GET /api/topics` is paginated but typically returns < 20 rows for the current user).
- **Topic detail page**: fetch `GET /api/topics/:id/papers?limit=50` on mount. If `nextCursor` returned, show a "Load more" button that passes `cursor=<value>` on the next call.
- **Cycle cadence**: it runs daily by default (`0 3 * * *` UTC). Don't auto-refresh the paper list more often than that — the data doesn't change between cycles.
- **Empty state copy**: pull it from §6's table. The `lastFetchedAt === null` case is by far the more common one immediately after creation, and the explanatory copy ("we'll start watching on the next cycle") is the difference between a confused user and a happy one.

---

## 10. Smoke test recipe (without writing a UI)

If you want to verify the integration before writing components:

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"researcher@example.com","password":"SuperSecret1!"}' \
  | jq -r .token)

# 2. Sources catalog
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/sources | jq '.sources[0].filterValues | length'
# → 155

# 3. Create a topic
curl -s -X POST http://localhost:4000/api/topics \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"My test","keywords":["diffusion"],"sourceFilters":["arxiv:cs.LG"]}' | jq

# 4. List
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/topics | jq

# 5. Per-topic papers (empty state initially)
TOPIC_ID=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/topics | jq -r '.items[0].id')
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:4000/api/topics/$TOPIC_ID/papers" | jq
```

A Postman collection of these is trivial to export from any of these `curl` lines — let me know if you want one prebuilt.

---

## 11. Things to ask the backend owner about

- **Where the production base URL lives** (the dev URL is `localhost:4000`; production is not deployed yet).
- **Whether you want a typed API client generated** — happy to add a `fetch`-based client module to the FE codebase modeled on these types if it helps.
- **Whether you want `lastFetchedAt` to drive a "last updated X minutes ago" badge** — easy to add if useful; the data is there.

---

## 12. Open known issues / sharp edges

- **Validation error code parity**: my contracts spec drafted machine-readable error codes (`DUPLICATE_NAME`, `UNKNOWN_SOURCE_FILTER`, etc.); the running backend reuses 001's plainer `{error, details}` envelope without a `code` field. If the FE really wants structured codes, I'll add them in a small follow-up — flag it now and I'll prioritize.
- **`Validation failed` status is 400, not 422**: matches 001's precedent. The contracts spec says 422 in places; **trust the implementation (400)**.
- **`sourceUrl` may carry a version suffix** (`...v1`, `...v2`). Don't strip it on the FE; arXiv's abstract page handles versioned URLs fine.
- **Cycle attribution caps at 50 newly-attributed papers per topic per cycle**. A topic with very broad keywords will hit this cap daily. Surface it in UX as "Showing the 50 most recent matches for this topic" if the count looks suspiciously round.
