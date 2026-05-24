# REST Contract: Paper Detail + Related Papers

**Resource**: a single `Paper` accessible to the requesting user. Access is granted if the paper is either (a) attributed to one of the user's current tracked topics, OR (b) favourited by the user (per Decision 10 — the bookmark widens access so the user can still see a paper after deleting its source topic).
**Base path**: `/api/papers`
**Authentication**: required (JWT bearer). Missing/invalid token → `401 Unauthorized`.

Error envelope:

```json
{ "error": "Human-readable message", "details": { /* optional */ } }
```

Status codes used: `200 OK`, `400 VALIDATION_FAILED`, `401 AUTH_REQUIRED`, `404 NOT_FOUND`.

---

## `GET /api/papers/:id` — full paper detail

Returns full metadata, the bullet summary (if available), and the user's bookmark state for one paper. Used by the FE detail view (US2).

### Request

```http
GET /api/papers/ckabc...
Authorization: Bearer <jwt>
```

**Path parameters**:

| Param | Notes |
|-------|-------|
| `id` | The catalog `Paper.id` (cuid). Must be a paper the user has access to (in catalog OR favourited). Otherwise `404`. |

No query parameters in v1.

### Responses

**`200 OK`** — body:

```json
{
  "paper": {
    "id": "ckabc...",
    "primarySource": "arxiv",
    "sourcePaperId": "2403.04102",
    "title": "Score-based diffusion for ...",
    "abstract": "Full abstract text, no truncation, ...",
    "authors": ["Alice Smith", "Bob Jones"],
    "sourceUrl": "https://arxiv.org/abs/2403.04102",
    "publishedAt": "2026-05-17T20:14:00.000Z",
    "firstFetchedAt": "2026-05-18T03:01:23.000Z"
  },
  "summary": {
    "status": "SUCCEEDED",                   // "SUCCEEDED" | "PENDING_RETRY" | "NOT_SUMMARISABLE"
    "bullets": [
      "Introduces a score-based generative model adapted to protein folding ...",
      "Combines a denoising diffusion prior with a structure-aware loss ...",
      "Demonstrates competitive accuracy on CASP15 benchmark targets.",
      "Releases pretrained checkpoints and an inference toolkit."
    ],
    "generatedAt": "2026-05-18T03:02:45.000Z",
    "model": "gemini-2.0-flash"
  },
  "topics": [                                 // The user's own topics that fetched this paper
    { "id": "ck...", "name": "Diffusion models for protein folding" }
  ],
  "isFavorited": true,                        // Whether THIS user has favourited
  "favoritedAt": "2026-05-18T08:30:00.000Z"   // ISO-8601 when favourited, null if not
}
```

### Summary section variations

The `summary` object's shape depends on the underlying `PaperSummary.status`:

| Status | `bullets` | `generatedAt` | `model` | `failureReason` |
|---|---|---|---|---|
| `SUCCEEDED` | `string[]` (3–5 entries) | ISO-8601 | model name | — |
| `PENDING_RETRY` (or no row exists) | `[]` | `null` | `null` | — |
| `NOT_SUMMARISABLE` | `[]` | `null` | `null` | reason string |

The `status` field is always present. FE renders the right state:

- `SUCCEEDED` → show bullets.
- `PENDING_RETRY` (or row absent) → show "summary not yet available — usually ready shortly" (FR-019).
- `NOT_SUMMARISABLE` → show "no summary available" (FR-016, FR-019).

The server never returns `bullets` while `status != SUCCEEDED` (FR-019 prohibits half-summaries).

**`401 AUTH_REQUIRED`** — no / invalid JWT.

**`404 NOT_FOUND`** — the paper does not exist OR is not in the user's catalog and is not favourited by them. The two cases are intentionally indistinguishable (enumeration-resistance).

```json
{ "error": "Paper not found." }
```

**`400 VALIDATION_FAILED`** — malformed `id` (rare; `id` is just a non-empty string).

---

## `GET /api/papers/:id/related` — related papers

Returns up to N related papers from the requesting user's own catalog (FR-029, FR-031). Used by the FE detail view to render the "related papers" sidebar (US6).

### Request

```http
GET /api/papers/ckabc.../related?limit=10
Authorization: Bearer <jwt>
```

**Path parameters**:

| Param | Notes |
|-------|-------|
| `id` | The origin paper's `Paper.id`. Must be in the user's catalog OR favourited (same access rule as the detail endpoint). |

**Query parameters**:

| Param | Values | Default | Notes |
|-------|--------|---------|-------|
| `limit` | integer 1–20 | 10 | `RECOMMENDATIONS_DEFAULT_LIMIT`, `RECOMMENDATIONS_MAX_LIMIT` env-driven. |

### Responses

**`200 OK`** — body:

```json
{
  "origin": { "id": "ckabc...", "title": "Score-based diffusion for ..." },
  "items": [
    {
      "id": "ckxyz...",
      "title": "Latent diffusion priors for biomolecular structure ...",
      "authors": ["Carla Ng", "Daniel Park"],
      "publishedAt": "2026-05-16T14:00:00.000Z",
      "sourceUrl": "https://arxiv.org/abs/2403.04018",
      "summaryAvailable": true,
      "isFavorited": false,
      "topics": [ { "id": "ck...", "name": "Diffusion models for protein folding" } ],
      "score": 7.82,                          // weighted similarity score (informational)
      "reasons": ["shared_topic", "shared_author", "lexical_similarity"]
    }
  ]
}
```

Notes:

- `items` is ordered by descending `score` per Decision 11.
- The origin paper itself never appears in `items` (FR-030).
- Every item is itself in the user's own catalog — no cross-user paper is ever surfaced (FR-031).
- `reasons` is an explanatory string list: one or more of `shared_topic`, `shared_author`, `shared_category`, `lexical_similarity`. FE can render small badges to surface *why* a paper was recommended ("Also by Alice Smith", "Same topic", etc.).
- If the user's catalog is too sparse to produce any candidate (e.g., they only have one paper), `items` is `[]` — `200 OK`, not an error. FE shows "no related papers found" (FR-033).
- If the similarity computation is currently in a state that cannot run (e.g., a future async path is still warming up), `items` is `[]` plus an optional `computationStatus: "pending"` field — but v1 computes inline, so this case does not occur in practice. The contract reserves the field name for forward compatibility.

**`401 AUTH_REQUIRED`** — no / invalid JWT.

**`404 NOT_FOUND`** — the origin paper is not in the user's catalog and not favourited.

**`400 VALIDATION_FAILED`** — `limit` out of range.

---

## What these endpoints do NOT do (v1)

- **Do not** trigger summarisation. Summaries are produced by the ingestion cycle (`002`'s `fetchCycle.service`); reading the detail endpoint never causes an AI service call. (FR-010.)
- **Do not** recompute related papers asynchronously. v1 computes inline on each request.
- **Do not** return paper PDFs or full-text. Only metadata (the abstract is the deepest content surfaced).
- **Do not** expose data from another user's catalog under any circumstance (FR-031).

---

## Authorization summary

JWT required on both endpoints. Repository-layer ownership filter:

```text
A paper P is "accessible" to user U if and only if:
  EXISTS TopicPaperMatch m WHERE m.paperId = P.id AND m.trackedTopic.userId = U.id
  OR
  EXISTS Favorite f WHERE f.paperId = P.id AND f.userId = U.id
```

Anything else returns `404` — no enumeration via differential status codes.
