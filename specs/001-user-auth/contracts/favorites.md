# REST Contract: Favorites

**Base path**: `/api/favorites`
**Auth required**: Bearer token on every endpoint. Failures return `401 Unauthorized` with `{ "error": "Authentication required." }`.

All requests/responses are `application/json`.

Favorites are scoped to the authenticated user. Cross-user reads/writes are impossible by construction — the user identifier is taken from the token, never from the request (spec FR-019).

---

## GET `/api/favorites`

List all of the authenticated user's favorited papers, most recently favorited first.

**Query parameters**: none in this iteration. Pagination is deferred; the endpoint returns all favorites. (Constitution principle V requires pagination/filtering/sorting behavior to be documented for list endpoints — none is offered here, intentionally.)

**Responses**:

- `200 OK` — body:
  ```json
  {
    "favorites": [
      { "paperId": "2401.12345v2", "createdAt": "2026-05-16T11:00:00.000Z" },
      { "paperId": "2312.98765",   "createdAt": "2026-05-16T10:30:00.000Z" }
    ]
  }
  ```

The internal `Favorite.id` is intentionally omitted from the response — clients identify favorites by `(userId implicit, paperId)`.

---

## POST `/api/favorites`

Add a paper to the authenticated user's favorites. Idempotent (spec FR-018): favoriting an already-favorited paper returns success and does not create a duplicate.

**Request body**:

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `paperId` | string | yes | Matches `^[A-Za-z0-9.\-/]{3,64}$`. |

**Responses**:

- `201 Created` — favorite newly created. Body:
  ```json
  { "paperId": "2401.12345v2", "createdAt": "2026-05-16T11:00:00.000Z" }
  ```
- `200 OK` — favorite already existed. Body is the existing favorite (same shape as `201`).
- `400 Bad Request` — invalid `paperId`.

There is no `409 Conflict` path — duplicates are absorbed (spec FR-018).

**Note**: This endpoint does not verify that the paper exists. Existence validation is deferred to when MVP feature #4 (paper storage) is in place; see research Decision 11.

---

## DELETE `/api/favorites/:paperId`

Remove a paper from the authenticated user's favorites.

**Path parameter**:

| Param | Validation |
|-------|------------|
| `paperId` | Same regex as above. |

**Responses**:

- `204 No Content` — favorite removed.
- `404 Not Found` — the user had no favorite for that `paperId`. Body: `{ "error": "Favorite not found." }`. Disclosing this is safe because the lookup is already scoped to the authenticated user.
