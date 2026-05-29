# REST Contract: Cycle Papers ("See more on PaperHub" target)

**Resource**: the set of papers fetched **for the requesting user** during a specific `FetchCycle`. Access is granted if every paper is attributed (via `TopicPaperMatch`) to one of the requesting user's current `TrackedTopic` rows AND the attribution's `cycleId` matches the path parameter.

**Base path**: `/api/notifications`

**Authentication**: required (JWT bearer). Missing/invalid token → `401 Unauthorized`.

This endpoint backs the **"See more on PaperHub"** link in digest emails (FR-005). It is grouped under `/api/notifications` because its only consumer is the digest-emanated frontend page, and grouping keeps the feature's surface area in one router. The catalog-level per-topic listings shipped in `002` remain at `/api/topics/:id/papers`.

Error envelope (consistent with `001` / `002` / `003`):

```json
{ "error": "Human-readable message", "details": { /* optional */ } }
```

Status codes used: `200 OK`, `400 VALIDATION_FAILED`, `401 AUTH_REQUIRED`, `404 NOT_FOUND`.

---

## `GET /api/notifications/cycles/:cycleId/papers` — list this user's papers fetched in a given cycle

Returns the papers newly attributed to the requesting user's tracked topics during the cycle identified by `cycleId`. Sorted using the same ordering as the digest's top-3 selection (most-recent `publishedAt` DESC, ties by `fetchedAt` DESC, then `Paper.id` ASC) so that the on-page list begins with the same three papers the user already saw in their email.

### Request

```http
GET /api/notifications/cycles/cl9abc.../papers?limit=50&cursor=cl9xyz...
Authorization: Bearer <jwt>
```

| Path param | Notes |
|------------|-------|
| `cycleId`  | The `FetchCycle.id` cuid. Must correspond to a cycle in which ≥ 1 paper was attributed to one of the requesting user's topics. Otherwise `404` (response is identical whether the cycle does not exist, exists but produced no papers for this user, or exists but only produced papers for *other* users — no information disclosure across users). |

| Query param | Type   | Default | Notes |
|-------------|--------|---------|-------|
| `limit`     | int    | 50      | 1 ≤ `limit` ≤ 200. Out-of-range → `400 VALIDATION_FAILED`. |
| `cursor`    | string | omitted | Opaque pagination cursor returned by a previous response's `nextCursor`. When present, the server returns the next page of results. |

### Responses

**`200 OK`** — body:

```json
{
  "cycle": {
    "id": "cl9abc...",
    "startedAt": "2026-05-26T03:00:00.000Z",
    "finishedAt": "2026-05-26T03:04:12.000Z"
  },
  "papers": [
    {
      "id": "cl9paper1...",
      "title": "Diffusion models for protein structure prediction",
      "authors": ["A. Researcher", "B. Coauthor"],
      "publishedAt": "2026-05-25T00:00:00.000Z",
      "fetchedAt":  "2026-05-26T03:01:17.000Z",
      "matchedTopics": [
        { "id": "cl9topic1...", "name": "Diffusion models for protein folding" }
      ],
      "summary": {
        "status": "SUCCEEDED",
        "bullets": [
          "Authors propose a conditional diffusion model for tertiary structure ...",
          "Reports a 12 % AUC improvement over the prior state of the art ...",
          "Limitations include compute cost and dataset coverage ..."
        ]
      },
      "detailUrl": "/papers/cl9paper1..."
    }
  ],
  "nextCursor": null
}
```

| Field                  | Type                          | Notes |
|------------------------|-------------------------------|-------|
| `cycle.id`             | `string` (cuid)               | Echo of the path parameter. |
| `cycle.startedAt`      | `string` (ISO-8601)           | From `FetchCycle.startedAt`. |
| `cycle.finishedAt`     | `string` (ISO-8601) \| `null` | `null` if the cycle is still running (rare — this endpoint is normally read after the cycle finishes). |
| `papers[]`             | array                         | Empty array IS NOT returned — an empty result is a `404` (see below) to keep the user-isolation behaviour uniform. |
| `papers[].id`          | `string` (cuid)               | `Paper.id`. |
| `papers[].title`       | `string`                      | Plain text; no HTML. |
| `papers[].authors`     | `string[]`                    | Ordered author list from `Paper.authors`. |
| `papers[].publishedAt` | `string` (ISO-8601)           | |
| `papers[].fetchedAt`   | `string` (ISO-8601)           | From `TopicPaperMatch.fetchedAt`. |
| `papers[].matchedTopics` | `Array<{id,name}>`          | All of the requesting user's tracked topics that this paper matched in this cycle. Length ≥ 1. |
| `papers[].summary.status` | `"SUCCEEDED" \| "PENDING_RETRY" \| "NOT_SUMMARISABLE" \| "ABSENT"` | `"ABSENT"` when no `PaperSummary` row exists yet for this paper. Maps to the "summary not yet available" placeholder in the email when not `SUCCEEDED`. |
| `papers[].summary.bullets` | `string[]` \| omitted     | Present only when `status === "SUCCEEDED"`. |
| `papers[].detailUrl`   | `string`                      | Relative URL into the frontend that resolves to the paper detail view (consistent with `003`'s detail surface). |
| `nextCursor`           | `string` \| `null`            | Pass back as `cursor` to fetch the next page. `null` on the last page. |

**`400 VALIDATION_FAILED`** — `cycleId` not a valid cuid, or `limit` / `cursor` out of range / malformed.

**`401 AUTH_REQUIRED`** — missing or invalid JWT.

**`404 NOT_FOUND`** — the cycle does not exist, OR it exists but the requesting user has zero papers attributed in it. The response body is the standard error envelope; identical across both cases to avoid cross-user information disclosure (FR-008):

```json
{ "error": "Cycle not found." }
```

### Side effects

None. This is a read-only endpoint.

### Notes

- The list ordering matches the email's top-3 selection rule (research.md Decision 4). The first three rows in the response are exactly the three papers shown in the digest, in the same order. This makes "See more" visually continuous from inbox to web.
- The summary shape mirrors `003`'s paper-detail summary representation so the frontend can reuse the same component.
- Pagination uses a cursor (opaque to the client) over `(publishedAt DESC, fetchedAt DESC, Paper.id ASC)`. Cursor format is server-internal; the contract guarantees only that passing a `nextCursor` back yields the next page deterministically.
- The endpoint scopes by `userId = req.userId` in the underlying repository call; the controller does not see the user's `userId` from a query param — only from the verified JWT.
- The frontend route that consumes this endpoint is the FE teammate's slice. The email's "See more on PaperHub" link target is `${FRONTEND_BASE_URL}/cycles/${cycleId}`; the FE teammate maps that route to a page that calls this endpoint.
