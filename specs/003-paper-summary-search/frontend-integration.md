# Frontend Integration Guide: Paper Reading Experience

**Audience**: frontend engineer integrating against the `003-paper-summary-search` backend.
**Status**: as-built — reflects what the backend actually returns, not the planning contract. Where this doc and `contracts/*.md` disagree, **this doc wins**.
**Prerequisites**: you already have `001-user-auth` (JWT bearer auth + favourites) and `002-topic-subscription` (topics + per-topic papers) integrated. This feature layers on top.

---

## 1. Quick orientation

- Base URL (dev): `http://localhost:4000`
- All endpoints require **JWT bearer auth** inherited from `001` — `Authorization: Bearer <token>` on every request.
- Content type: `application/json` on every request with a body.

What this feature adds (6 endpoint surfaces, 5 net-new):

| # | Method | Path | What it does | Story |
|---|---|---|---|---|
| 1 | `GET` | `/api/search/papers` | Free-text search of the user's catalog | US1 + US5 (filters) |
| 2 | `GET` | `/api/papers/:id` | Full paper detail (metadata + bullet summary + bookmark state + topics) | US2 |
| 3 | `GET` | `/api/papers/:id/related` | Up to N related papers from the user's catalog, scored | US6 |
| 4 | `GET` | `/api/favorites/papers` | **NEW** — favourites with full paper detail (replaces the bare `001` list) | US4 |
| 5 | `POST` | `/api/favorites` | (existing) — **now validates** paper is in user's catalog | US4 |
| 6 | `DELETE` | `/api/favorites/:paperId` | (existing) — unchanged | US4 |

What this feature **does NOT** ship (don't build UI for):

- No "Summarize" button. Summaries are produced automatically by the system as part of the ingestion cycle from `002`.
- No "Regenerate summary" affordance.
- No global "Browse all papers" view. Search is scoped to the user's own catalog (papers attributed to one of their tracked topics, plus papers they've favourited).
- No cross-user recommendations. Related papers come from the user's own catalog.
- No real-time updates / push. Summaries arrive at the next ingestion cycle; the user sees them on the next page load.

---

## 2. Error envelope (read this once)

Every error response uses 001's plain shape:

```ts
type ErrorResponse = {
  error: string;            // human-readable message
  details?: unknown;        // present only for VALIDATION_FAILED
};
```

There is **no machine-readable `code` field** on the wire. The frontend distinguishes errors by **HTTP status code** plus, for ambiguous 4xx cases, the `error` string prefix.

### Status code → meaning table

| HTTP | When | Handling |
|---|---|---|
| 200 | GET success | Render. |
| 201 | POST `/api/favorites` newly bookmarked | Update local state. |
| 204 | DELETE success | Remove from local state. |
| 400 | Zod validation failed | Show field errors from `details.fieldErrors`. |
| 401 | No / invalid / expired JWT | Redirect to login. |
| 404 | Paper / topic missing or not in user's catalog | "Not found." Don't distinguish from "not yours." |
| 409 | Duplicate / cap exceeded (e.g., `001`'s topic-name dup) | Inline error on the offending field. |
| 5xx | Backend or AI / arXiv hiccup | "Something went wrong. Try again." |

### Validation error shape (status 400)

```json
{
  "error": "Validation failed.",
  "details": {
    "formErrors": [],
    "fieldErrors": {
      "q": ["Required."]
    }
  }
}
```

`details` is the Zod `flatten()` output. `fieldErrors` keys match the field names from the schema; values are arrays of messages.

---

## 3. Paper search

### `GET /api/search/papers`

Returns up to `limit` papers from the user's own catalog whose title / abstract / authors match the query. Ranked by MySQL `MATCH ... AGAINST` relevance by default; ties broken by `publishedAt DESC`.

**Query parameters** (all optional except `q`):

| Param | Values | Default | Notes |
|---|---|---|---|
| `q` | string, 1–200 chars | — | **Required.** Free-text query. |
| `sort` | `relevance` \| `publishedAt` \| `matchedAt` | `relevance` | Default sorts by `MATCH` score. |
| `order` | `asc` \| `desc` | `desc` | |
| `limit` | int 1–50 | 20 | Server caps at 50. |
| `cursor` | opaque string | — | From prior `nextCursor`. |
| `topicId` | string | — | Filter: papers fetched for this topic (must be the user's). |
| `publishedFrom` | ISO-8601 date | — | Filter: `publishedAt >= from`. |
| `publishedTo` | ISO-8601 date | — | Filter: `publishedAt <= to`. |
| `author` | 1–100 chars | — | Filter: substring on author names (case-insensitive). |

Multiple filters combine with AND.

**Response (200)**:

```json
{
  "query": "diffusion model",
  "items": [
    {
      "id": "cmpdsi...",
      "primarySource": "arxiv",
      "sourcePaperId": "2403.04102",
      "title": "Score-based diffusion for ...",
      "abstractExcerpt": "We present ... (truncated to ~280 chars, ends with …)",
      "authors": ["Alice Smith", "Bob Jones"],
      "sourceUrl": "https://arxiv.org/abs/2403.04102v1",
      "publishedAt": "2026-05-17T20:14:00.000Z",
      "topics": [
        { "id": "ck...", "name": "Diffusion models for protein folding" }
      ],
      "isFavorited": true,
      "summaryAvailable": true,
      "score": 10.301
    }
  ],
  "nextCursor": "..."
}
```

Field notes:

- `abstractExcerpt` is the first ~280 chars of the abstract with trailing whitespace cleaned and `…` appended. **Don't show the full abstract on the search card** — call `GET /api/papers/:id` for that.
- `summaryAvailable: true` means the FE can confidently show a "summary ready" badge on the card. The actual bullets come from the detail endpoint.
- `isFavorited` is per-request — recompute on each search response.
- `score` is informational. The list is already sorted; the FE can ignore it.
- `topics[]` lists the user's own topics that fetched this paper. A paper may appear under multiple topics — render as small chips.

**Empty-state rules**:

| Server response | Meaning | UI |
|---|---|---|
| `items: []` with non-trivial `q` | Query found no matches | "No papers in your catalog match `<q>`." |
| `items: []` and the user has zero tracked topics | Empty catalog | "Create a tracked topic first — papers will appear here once the system fetches them." (Use `001`'s `GET /api/topics` count.) |

**Sharp edges**:

- **MySQL FULLTEXT ignores tokens < 3 chars** by default. Searching `"ml"` returns nothing; `"llm"` works. If you want suggestions on short queries, prompt the user with "try a longer term."
- **`q` length > 200** → 400. Truncate input or warn at 200 chars.

---

## 4. Paper detail

### `GET /api/papers/:id`

The destination for any in-app navigation to a paper — from search results, per-topic view, favourites, or related papers.

Access rule (Decision 10): the user can view a paper detail if it is **either** in their current catalog (attributed to one of their tracked topics) **or** they have favourited it. Anything else returns 404.

**Response (200)**:

```json
{
  "paper": {
    "id": "cmpdsi...",
    "primarySource": "arxiv",
    "sourcePaperId": "2403.04102",
    "title": "Score-based diffusion for ...",
    "abstract": "Full abstract, no truncation, ...",
    "authors": ["Alice Smith", "Bob Jones"],
    "sourceUrl": "https://arxiv.org/abs/2403.04102v1",
    "publishedAt": "2026-05-17T20:14:00.000Z",
    "firstFetchedAt": "2026-05-18T03:01:23.000Z"
  },
  "summary": {
    "status": "SUCCEEDED",
    "bullets": [
      "Introduces a score-based generative model adapted to protein folding ...",
      "Combines a denoising diffusion prior with a structure-aware loss ...",
      "Demonstrates competitive accuracy on CASP15 benchmark targets.",
      "Releases pretrained checkpoints and an inference toolkit."
    ],
    "generatedAt": "2026-05-18T03:02:45.000Z",
    "model": "gemini-3.1-flash-lite",
    "failureReason": null
  },
  "topics": [
    { "id": "ck...", "name": "Diffusion models for protein folding" }
  ],
  "isFavorited": true,
  "favoritedAt": "2026-05-18T08:30:00.000Z"
}
```

### Summary section — three states (this is the most-missed UI nuance)

The `summary.status` field is always present. Render conditionally:

| `status` | `bullets` | Render |
|---|---|---|
| `SUCCEEDED` | 3–5 strings | The bullets, plus a small "Generated by AI" badge with `model` value. |
| `PENDING_RETRY` | `[]` | "Summary not yet available — usually ready within hours." (Loading-style state, but no spinner — the next fetch cycle will produce it.) |
| `NOT_SUMMARISABLE` | `[]` | "No summary available." Optionally show `failureReason` (e.g., `"abstract_too_short_or_empty"`) in a tooltip. |

The server **never** returns `bullets` while `status != SUCCEEDED` (this is FR-019 — no half-summary leak). Don't try to "show something" for the pending case; the empty-state copy IS the right UI.

**Failure cases**:

- **401** — missing / invalid JWT.
- **404** — paper doesn't exist OR is not accessible to this user. The two are intentionally indistinguishable.

---

## 5. Related papers

### `GET /api/papers/:id/related?limit=10`

Surfaced on the paper detail view as a sidebar / list. All recommendations are from the **user's own catalog** — the system never shows another user's papers.

**Query parameters**:

| Param | Values | Default | Notes |
|---|---|---|---|
| `limit` | int 1–20 | 10 | Server caps at 20. |

**Response (200)**:

```json
{
  "origin": { "id": "cmpdsi...", "title": "Score-based diffusion for ..." },
  "items": [
    {
      "id": "ckxyz...",
      "title": "Latent diffusion priors for biomolecular structure ...",
      "authors": ["Carla Ng", "Daniel Park"],
      "publishedAt": "2026-05-16T14:00:00.000Z",
      "sourceUrl": "https://arxiv.org/abs/2403.04018v1",
      "summaryAvailable": true,
      "isFavorited": false,
      "topics": [{ "id": "ck...", "name": "Diffusion models for protein folding" }],
      "score": 7.823,
      "reasons": ["shared_topic", "shared_author", "lexical_similarity"]
    }
  ]
}
```

Field notes:

- Items are pre-sorted by descending `score`.
- The origin paper itself **never** appears in `items`.
- `reasons[]` is the killer UX hook — render small badges per reason: "Same topic", "Same author", "Same category", "Similar text". Users grasp *why* immediately.
- Each item's `topics[]` is one of the requesting user's topics (never a foreign topic).
- Clicking an item should navigate to `GET /api/papers/<item.id>` — its own detail view, which then has its own related list.

**Empty-state**:

- `items: []` is **not** an error. It just means the user's catalog is too small (e.g., a single paper) or no candidate scored high enough. Render "No related papers found yet — your catalog is still small."

**Failure cases**:

- **404** — origin paper not accessible (same rule as detail endpoint).
- **400** — `limit` out of range.

---

## 6. Bookmarks (favourites)

### Existing endpoints from `001` (tightened in 003)

**`POST /api/favorites`** — bookmark a paper.

Request body: `{ "paperId": "ck..." }`

Behaviour:

- **201** — newly bookmarked.
- **200** — already bookmarked (idempotent re-bookmark).
- **404** — `paperId` is not in the user's catalog **right now**. This is the new FR-024 check. The error is intentionally a 404, not a 422 — enumeration-resistance.

The detail page should call this when the user clicks "Bookmark", and disable the button while in flight.

**`DELETE /api/favorites/:paperId`** — unbookmark. Returns 204 on success, 404 if not bookmarked. Idempotent.

**`GET /api/favorites`** — (legacy `001`) bare list. Returns only `{ paperId, createdAt }`. Don't use this for the favourites page — use `/papers` (next).

### New endpoint (use this for the favourites page)

**`GET /api/favorites/papers?limit=50&cursor=...`**

Returns each favourite joined to full paper metadata, summary availability, and the user's CURRENT topics that fetch the paper.

**Response (200)**:

```json
{
  "items": [
    {
      "favoritedAt": "2026-05-23T08:30:00.000Z",
      "paper": {
        "id": "cmpdsi...",
        "primarySource": "arxiv",
        "sourcePaperId": "2403.04102",
        "title": "Score-based diffusion for ...",
        "abstractExcerpt": "We present ...",
        "authors": ["Alice Smith", "Bob Jones"],
        "sourceUrl": "https://arxiv.org/abs/2403.04102v1",
        "publishedAt": "2026-05-17T20:14:00.000Z"
      },
      "summaryAvailable": true,
      "topics": [{ "id": "ck...", "name": "Diffusion models for protein folding" }],
      "inCatalog": true
    }
  ],
  "nextCursor": "..."
}
```

Items are ordered by `favoritedAt DESC`.

### Three favourite-row states (Decision 10 — bookmark persists after topic deletion)

| Server row | Meaning | Suggested UI |
|---|---|---|
| `paper: {...}, topics: [..non-empty..], inCatalog: true` | Normal | Render full card with topic chips. |
| `paper: {...}, topics: [], inCatalog: false` | Paper is in the system, but the user has no current topic that fetches it (they deleted the topic — bookmark persisted) | Render full card; show "(no current topic)" instead of chips. Detail page navigation still works. |
| `paper: null, topics: [], inCatalog: false` | Legacy `001` favourite — `paperId` was an arbitrary string, no matching `Paper` row | Render minimal "metadata unavailable" card. Show unbookmark button. Don't navigate to detail (would 404). |

The third state is rare (only matters if any pre-003 favourites exist with non-cuid paperIds).

---

## 7. TypeScript types (copy-paste)

```ts
// ----- shared error -----
export interface ErrorResponse {
  error: string;
  details?: {
    formErrors?: string[];
    fieldErrors?: Record<string, string[]>;
  };
}

// ----- search -----
export interface SearchResultItem {
  id: string;
  primarySource: string;       // "arxiv"
  sourcePaperId: string;       // arXiv ID, version-stripped
  title: string;
  abstractExcerpt: string;     // truncated, ends with …
  authors: string[];
  sourceUrl: string;           // may include version suffix
  publishedAt: string;         // ISO-8601
  topics: Array<{ id: string; name: string }>;
  isFavorited: boolean;
  summaryAvailable: boolean;
  score: number;
}

export interface SearchResponse {
  query: string;
  items: SearchResultItem[];
  nextCursor?: string;
}

// ----- paper detail -----
export type SummaryStatus = "SUCCEEDED" | "PENDING_RETRY" | "NOT_SUMMARISABLE";

export interface PaperSummary {
  status: SummaryStatus;
  bullets: string[];           // populated only when status === "SUCCEEDED"
  generatedAt: string | null;
  model: string | null;        // e.g., "gemini-3.1-flash-lite"
  failureReason: string | null;
}

export interface PaperDetail {
  paper: {
    id: string;
    primarySource: string;
    sourcePaperId: string;
    title: string;
    abstract: string;
    authors: string[];
    sourceUrl: string;
    publishedAt: string;
    firstFetchedAt: string;
  };
  summary: PaperSummary;
  topics: Array<{ id: string; name: string }>;
  isFavorited: boolean;
  favoritedAt: string | null;
}

// ----- related papers -----
export type RecommendationReason =
  | "shared_topic"
  | "shared_author"
  | "shared_category"
  | "lexical_similarity";

export interface RelatedPaperItem {
  id: string;
  title: string;
  authors: string[];
  publishedAt: string;
  sourceUrl: string;
  summaryAvailable: boolean;
  isFavorited: boolean;
  topics: Array<{ id: string; name: string }>;
  score: number;
  reasons: RecommendationReason[];
}

export interface RelatedPapersResponse {
  origin: { id: string; title: string };
  items: RelatedPaperItem[];
}

// ----- favourites (rich list) -----
export interface FavoritePaperItem {
  favoritedAt: string;
  paper: {
    id: string;
    primarySource: string;
    sourcePaperId: string;
    title: string;
    abstractExcerpt: string;
    authors: string[];
    sourceUrl: string;
    publishedAt: string;
  } | null;                    // null for legacy 001 favourites with no matching Paper row
  summaryAvailable: boolean;
  topics: Array<{ id: string; name: string }>;
  inCatalog: boolean;
}

export interface FavoritePapersResponse {
  items: FavoritePaperItem[];
  nextCursor?: string;
}
```

---

## 8. Limits the FE should mirror

| Limit | Default | Server env var |
|---|---|---|
| Search results per page | 20 (default), 50 (max) | `SEARCH_DEFAULT_LIMIT` / `SEARCH_MAX_LIMIT` |
| Related papers per page | 10 (default), 20 (max) | `RECOMMENDATIONS_DEFAULT_LIMIT` / `RECOMMENDATIONS_MAX_LIMIT` |
| Favourites per page | 50 (default), 100 (max) | (hard-coded server-side) |
| Search query length | 1–200 chars | (validation schema) |

The numbers may move via env; the rules don't. Always handle 400 from the server as the source of truth.

---

## 9. Suggested UX rhythms

- **Search-as-you-type vs explicit submit**: the FULLTEXT query is cheap (single-user catalog, hundreds of rows max) — debounced search-as-you-type at 300ms is fine. Cancel the in-flight request when the query changes.
- **First-load of the favourites page**: call `GET /api/favorites/papers` directly; don't first call the bare `/api/favorites` and then enrich client-side.
- **Bookmark optimistic update**: flip the button state immediately on click, fire `POST /api/favorites`, revert on error (esp. on 404 — paper left the catalog between page render and click).
- **Paper detail page should fetch in parallel**: `GET /api/papers/:id` and `GET /api/papers/:id/related?limit=5` can fire together. Detail blocks the page; related can stream in late.
- **Summary "loading" copy**: don't show a spinner. The summary either exists or it doesn't — the next fetch cycle (every few hours by default in `002`) will fill it in. Phrasing like "Summary will be ready shortly" sets the right expectation.
- **Related papers empty-state**: very common for new users with one or two topics. "We need a few more papers in your catalog to find connections" is friendlier than a generic empty message.
- **Filter chips on the search page**: expose the four filter params (topic, date from / to, author) as removable chips above the result list. Each chip removal re-runs the search.

---

## 10. Smoke test recipe

If you want to verify the integration before writing components:

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"researcher@example.com","password":"SuperSecret1!"}' \
  | jq -r .token)

# 2. Search
curl -s -H "Authorization: Bearer $TOKEN" \
  'http://localhost:4000/api/search/papers?q=diffusion&limit=5' | jq

# 3. Detail
PAPER_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
  'http://localhost:4000/api/search/papers?q=diffusion&limit=1' | jq -r '.items[0].id')
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/papers/$PAPER_ID" | jq

# 4. Related
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/papers/$PAPER_ID/related?limit=5" | jq

# 5. Bookmark
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"paperId\":\"$PAPER_ID\"}" http://localhost:4000/api/favorites

# 6. Rich favourites list
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:4000/api/favorites/papers | jq

# 7. Unbookmark
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/favorites/$PAPER_ID"
```

A Postman collection of these is trivial to export — let me know if you want one prebuilt.

---

## 11. Open questions to flag back to me

- **Per-user summary cap**: the server has an `AI_PER_CYCLE_SUMMARY_CAP` (default 50) gating the AI service. It's a system-wide guardrail, not per-user. There's no rate limit on the FE side. If you want a "you've used X / Y summaries today" UI element, ask — none currently surfaced.
- **Real-time summary updates**: a user may load a paper while `status: "PENDING_RETRY"` and the summary will be available a few hours later. No push / SSE / polling is wired today; user has to reload. If you want a "summary just landed" affordance, we'd need to add an endpoint or a websocket.
- **Search analytics**: per-user search counts are logged server-side (no query text); not exposed via API. Tell me if you want a "you've searched X times this week" UI.

---

## 12. Known sharp edges

- **Validation status is 400, not 422**. The contracts spec in `contracts/*.md` says 422 in places; the implementation matches 001's precedent (400). Trust this doc.
- **No `code` field on error responses.** Just `{error: string, details?: ...}`. If structured error codes become important on the FE, flag it and I'll add a small wrapper.
- **`sourceUrl` may include version suffix** (`...v1`, `...v2`). Don't strip it — arXiv handles both.
- **`summaryAvailable` ≠ "this paper has bullets right now"** — it's a hint based on `PaperSummary.status === "SUCCEEDED"`. A `NOT_SUMMARISABLE` paper has `summaryAvailable: false` even though we know we won't ever generate bullets for it. The detail page is the authoritative source for what's actually shown.
- **Related papers can be sparse for small catalogs.** A user with one or two papers will see `items: []` on every detail page. Empty-state copy matters.
- **`POST /api/favorites` 404 is FR-024 enforcement**, not a "lookup failed" — it means the user no longer has a topic that fetches this paper. The bookmark UI should be hidden in that case (a paper they can't currently bookmark) or the click should explain ("This paper is no longer in your catalog").
- **Favourites with `paper: null`** are legacy `001` rows from before this feature. Render gracefully, but in practice your `001` integration probably never wrote arbitrary `paperId` strings — if so, this case never happens for your users.

---

## 13. Things to ask the backend owner about

- **Production base URL** (dev is `localhost:4000`).
- **Generated FE client** — happy to scaffold a typed `fetch` client module in the FE codebase modelled on the types in §7. Saves you writing the same shapes by hand.
- **Postman collection** — trivial to export if useful.
- **A "summary status" widget** in the global nav (e.g., "12 papers summarised today / 50 cap") if you want operator-style visibility for power users.
