# REST Contract: Source Catalog

**Resource**: the read-only catalog of paper sources and source-specific filter values the frontend can offer when building a tracked topic.
**Base path**: `/api/sources`
**Authentication**: required (JWT bearer). Same enforcement as `topics.md`.

The catalog content lives in `backend/src/config/sources.ts` as a typed constant (Decision 6). This endpoint serves the constant verbatim. There is no POST/PATCH/DELETE — the catalog is not user-editable.

---

## `GET /api/sources` — list available sources

### Request

```http
GET /api/sources
Authorization: Bearer <jwt>
```

No query parameters in v1. (Future: pagination if the catalog grows.)

### Responses

**`200 OK`** — body:

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
        { "value": "arxiv:q-bio.BM", "displayName": "Biomolecules" },
        ...
      ]
    }
  ]
}
```

Field meaning:

- `id`: stable source identifier; matches the prefix used in `TrackedTopic.sourceFilters` entries (e.g., the prefix `arxiv:` in `"arxiv:cs.AI"`).
- `displayName`: user-facing source name for the picker.
- `filterKey`: the source's native filter dimension (for arXiv, `"category"`; future PubMed might use `"mesh"`, etc.). v1 frontends only need to render the values.
- `filterValues[].value`: the exact string the frontend MUST send back in `TrackedTopic.sourceFilters` for this option.
- `filterValues[].displayName`: human-readable label for the picker.

**`401 UNAUTHENTICATED`** — no or invalid JWT.

---

## Caching

This endpoint is safe to cache aggressively on the client. The catalog only changes on backend deploy. v1 does not set `Cache-Control` headers (consistent with 001's "skip perf" stance), but a future client may cache for the session lifetime.

---

## Why this endpoint exists

The `TrackedTopic` create / edit flow needs the source filter picker to be authoritative — clients must not hard-code arXiv categories on the FE side, because the backend will reject unknown filter values (`UNKNOWN_SOURCE_FILTER`, 422). This endpoint is the single source of truth that the frontend renders from.

A second consequence: when the backend adds a new arXiv category to the catalog, every FE picks it up automatically on next request, with no FE deploy required.
