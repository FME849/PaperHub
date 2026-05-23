# REST Contract: Paper Search

**Resource**: search over the requesting user's own paper catalog (papers attributed via `TopicPaperMatch` to any of the user's tracked topics).
**Base path**: `/api/search`
**Authentication**: required on every endpoint via the JWT bearer middleware from `001` (`Authorization: Bearer <jwt>`). Missing/invalid token → `401 Unauthorized`.

Error envelope (consistent with `001` / `002`):

```json
{ "error": "Human-readable message", "details": { /* optional, Zod-flattened */ } }
```

Status codes used: `200 OK`, `400 VALIDATION_FAILED` (Zod), `401 AUTH_REQUIRED`.

---

## `GET /api/search/papers` — search the user's catalog

### Request

```http
GET /api/search/papers?q=diffusion%20model&sort=relevance&limit=20
Authorization: Bearer <jwt>
```

**Query parameters**:

| Param | Values | Default | Notes |
|-------|--------|---------|-------|
| `q` | string, 1–200 chars | — | **Required**. Free-text query. Searched against `Paper.title` and `Paper.abstract` via MySQL `FULLTEXT MATCH ... AGAINST`. Author names are also scanned (substring match on `Paper.authors`). |
| `sort` | `relevance` \| `publishedAt` \| `matchedAt` | `relevance` | Default ranking by `MATCH` score. Falling back to `publishedAt` lets the user override into chronological order. |
| `order` | `asc` \| `desc` | `desc` | |
| `limit` | integer 1–50 | 20 | `SEARCH_DEFAULT_LIMIT`, `SEARCH_MAX_LIMIT` env-driven. |
| `cursor` | opaque string | — | From a prior response's `nextCursor`. |
| `topicId` | string (TrackedTopic.id) | — | Filter: restrict to papers attributed to this topic (must belong to the requesting user). |
| `publishedFrom` | ISO-8601 date | — | Filter: papers published on/after this date. |
| `publishedTo` | ISO-8601 date | — | Filter: papers published on/before this date. |
| `author` | string, 1–100 chars | — | Filter: substring match on any author name (case-insensitive). |

Multiple filters combine with AND (FR-027).

### Responses

**`200 OK`** — body:

```json
{
  "query": "diffusion model",
  "items": [
    {
      "id": "ckabc...",                    // Paper.id
      "primarySource": "arxiv",
      "sourcePaperId": "2403.04102",
      "title": "Score-based diffusion for ...",
      "abstractExcerpt": "We present ... (truncated to ~280 chars for the result card)",
      "authors": ["Alice Smith", "Bob Jones"],
      "sourceUrl": "https://arxiv.org/abs/2403.04102",
      "publishedAt": "2026-05-17T20:14:00.000Z",
      "topics": [                          // The requesting user's topic(s) that fetched this paper
        { "id": "ck...", "name": "Diffusion models for protein folding" }
      ],
      "isFavorited": true,                 // Whether THIS user has favourited it
      "summaryAvailable": true,            // Whether a SUCCEEDED PaperSummary exists for this paper
      "score": 0.738                       // MySQL MATCH ... AGAINST score (relevance ranking)
    }
  ],
  "nextCursor": "..."                      // omitted when this is the last page
}
```

Notes on the shape:

- `abstractExcerpt` is the first ~280 characters of the abstract. The full abstract is returned by `GET /api/papers/:id` (see `contracts/papers.md`), not by search results.
- `summaryAvailable: true` means the FE can confidently show a summary indicator on the search card; the full bullets come from the detail endpoint.
- `isFavorited` is computed per request from the user's `Favorite` rows.
- `score` is mainly informational (for debugging). FE clients can ignore it; sort order is already applied.

**`400 VALIDATION_FAILED`** — `q` is missing, `q` is shorter than 1 char or longer than 200, `limit` out of range, `publishedFrom`/`publishedTo` not parseable, `topicId` is not a non-empty string.

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

**`401 AUTH_REQUIRED`** — no / invalid JWT.

---

## Empty-state semantics (FR-006)

A query with no matches returns `items: []` and (typically) no `nextCursor`. This is **not** an error — `200 OK` with an empty list. FE renders the empty-state message ("No papers in your catalog match that search").

Distinguishing the two empty cases on the FE:

| Server response | Catalog state | UI |
|---|---|---|
| `items: []` after a non-trivial query (`q.length ≥ 3`) | User has fetched papers, none match | "No papers in your catalog match `<q>`." |
| `items: []` and the user has zero fetched papers | Empty catalog | "Create a tracked topic first; the system will fetch papers and they'll be searchable here." |

The server does not annotate which case applies; the FE infers from the user's topic count (already available from `GET /api/topics` in `002`).

---

## Authorization summary

JWT required. The query is filtered server-side at the repository layer by `userId = req.userId` — papers not attributed to any of the requesting user's tracked topics can never appear in results (FR-004, enforced by `paper.repository.searchByUserCatalog`).
