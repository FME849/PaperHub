# REST Contract: Users (Profile)

**Base path**: `/api/users`
**Auth required**: Bearer token on every endpoint. Failures return `401 Unauthorized` with `{ "error": "Authentication required." }`.

All requests/responses are `application/json`.

The `me` segment always resolves to the user identified by the bearer token. There is no `/api/users/:id` — this feature does not expose other users' profiles (spec FR-013).

---

## GET `/api/users/me`

Return the authenticated user's profile.

**Request body**: none.

**Responses**:

- `200 OK` — body:
  ```json
  {
    "id": 1,
    "email": "ada@example.com",
    "displayName": "Ada Lovelace",
    "bio": null,
    "createdAt": "2026-05-16T10:00:00.000Z",
    "updatedAt": "2026-05-16T10:00:00.000Z"
  }
  ```
- `401 Unauthorized` — missing or invalid token.

---

## PATCH `/api/users/me`

Update the authenticated user's editable profile fields. Only the fields present in the body are changed; omitted fields are left untouched.

**Request body** (all fields optional, at least one required):

| Field | Type | Validation |
|-------|------|------------|
| `displayName` | string | 1-80 chars after trim. |
| `bio` | string \| null | Up to 500 chars after trim. Send `null` to clear. |

**Responses**:

- `200 OK` — body is the updated profile in the same shape as `GET /me`.
- `400 Bad Request` — empty body, or one or more fields fail validation. `details` contains the Zod issue list.
- `401 Unauthorized` — missing or invalid token.

**Email changes are not supported in this endpoint** (out of spec scope; see spec Assumptions).

---

## POST `/api/users/me/password`

Change the authenticated user's password.

**Request body**:

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `currentPassword` | string | yes | Must match the stored hash. |
| `newPassword` | string | yes | Min 8 chars, letter + digit; must differ from `currentPassword`. |

**Responses**:

- `204 No Content` — password successfully changed. The current token remains valid (see research; session fan-out invalidation is deferred).
- `400 Bad Request` — validation failure (e.g., `newPassword` too weak, or equal to `currentPassword`).
- `401 Unauthorized` — missing/invalid token, or `currentPassword` does not match. The body is the same generic `{ "error": "Authentication required." }` for token failures and `{ "error": "Invalid current password." }` when the token is valid but the password check fails. (The latter is acceptable because the caller is already authenticated.)
