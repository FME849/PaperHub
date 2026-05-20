# REST Contract: Per-Topic Fetched Papers

**Resource**: papers attributed to a `TrackedTopic` via `TopicPaperMatch`
**Base path**: `/api/topics/:topicId/papers`
**Authentication**: required (JWT bearer, as in `topics.md`).

This contract serves User Story 3 (per-topic fetched-paper view).

---

## `GET /api/topics/:topicId/papers` — list papers fetched for one topic

Returns all papers attributed to the given topic, joined from `TopicPaperMatch` to `Paper`. Sort and pagination as below. Topics never expose other users' attributions (FR-022).

### Request

```http
GET /api/topics/ckxyz.../papers?sort=publishedAt&order=desc&limit=50
Authorization: Bearer <jwt>
```

**Path parameters**:

| Param | Notes |
|-------|-------|
| `topicId` | Must belong to the authenticated user; otherwise `404`. |

**Query parameters** (all optional):

| Param | Values | Default | Notes |
|-------|--------|---------|-------|
| `sort` | `publishedAt` \| `fetchedAt` | `publishedAt` | Reverse-chronological-by-publication by default (FR-021) |
| `order` | `asc` \| `desc` | `desc` | |
| `limit` | integer 1–100 | 50 | Pagination cap |
| `cursor` | opaque string | — | Cursor-based pagination (encodes the last item's sort-key value + `id`) |

### Responses

**`200 OK`** — body:

```json
{
  "topic": {
    "id": "ckxyz...",
    "name": "Diffusion models for protein folding",
    "lastFetchedAt": "2026-05-18T03:01:23.000Z"
  },
  "items": [
    {
      "id": "ckabc...",                        // Paper.id
      "primarySource": "arxiv",
      "sourcePaperId": "2403.04102",
      "title": "Score-based diffusion for ...",
      "abstract": "We present ...",
      "authors": ["Alice Smith", "Bob Jones"],
      "sourceUrl": "https://arxiv.org/abs/2403.04102",
      "publishedAt": "2026-05-17T20:14:00.000Z",
      "matchedAt": "2026-05-18T03:01:23.000Z"  // TopicPaperMatch.fetchedAt
    },
    ...
  ],
  "nextCursor": "..."
}
```

Notes:

- The same paper may appear under multiple topics owned by the same user (FR-022 / Story 3 AS-3). Each topic's paper list is independent.
- A brand-new topic that has not yet been through a fetch cycle (no rows in `TopicPaperMatch` for it) returns `items: []` and `nextCursor` omitted, plus `topic.lastFetchedAt: null`. The frontend uses these signals to render the explanatory empty state required by FR-023.

**`401 UNAUTHENTICATED`** — no or invalid JWT.
**`404 NOT_FOUND`** — topic doesn't exist or isn't yours (same enumeration-resistance as `topics.md`).
**`422 VALIDATION_FAILED`** — invalid query parameters.

---

## What this endpoint does NOT do (v1)

- **Does not** trigger a fetch. Reading the endpoint never causes a cycle to run. (FR-019 / spec decision: no on-demand "refresh now" in v1.)
- **Does not** return per-paper "is this attributed to other topics of mine?" cross-references. That data is derivable via separate calls and is not a v1 requirement.
- **Does not** return any data from other users' topics, even for the same paper.

---

## Frontend handoff notes (FE deferred, but contract is the handoff)

- Empty state vs. loading: `items: []` with `topic.lastFetchedAt = null` ⇒ "waiting for first cycle." `items: []` with `topic.lastFetchedAt != null` ⇒ "no new papers in this cycle's window" (rare with reasonable keywords).
- Pagination: `nextCursor` is opaque; do not decode it client-side. Stop pagination when it is absent.
- Sort defaults match the spec's "reverse chronological by publication date" requirement (FR-021); UI does not need to set query params for the common case.
