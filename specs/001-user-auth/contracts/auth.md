# REST Contract: Authentication

**Base path**: `/api/auth`
**Auth required**: None (these endpoints establish or end an authenticated session).

All requests/responses are `application/json` unless noted. Error responses use the common shape `{ "error": string, "details"?: unknown }`.

---

## POST `/api/auth/register`

Create a new account.

**Request body**:

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `email` | string | yes | Valid email format, length 1-254. Stored lowercased. |
| `password` | string | yes | Min 8 chars, must contain a letter and a digit. |
| `displayName` | string | no | 1-80 chars after trim. Defaults to the local-part of `email` if omitted. |

**Responses**:

- `201 Created` — body:
  ```json
  {
    "user": { "id": 1, "email": "ada@example.com", "displayName": "ada", "bio": null, "createdAt": "2026-05-16T10:00:00.000Z" },
    "token": "<jwt>"
  }
  ```
  The token is the same shape issued by `/login` and is included so the client can move straight to a logged-in state.
- `400 Bad Request` — validation failure. `details` contains the Zod issue list.
- `409 Conflict` — `{ "error": "Email is already registered." }`. Triggered by the unique-email constraint after case-insensitive normalization.

---

## POST `/api/auth/login`

Exchange credentials for a JWT.

**Request body**:

| Field | Type | Required |
|-------|------|----------|
| `email` | string | yes |
| `password` | string | yes |

**Responses**:

- `200 OK` — body:
  ```json
  {
    "user": { "id": 1, "email": "ada@example.com", "displayName": "ada", "bio": null, "createdAt": "2026-05-16T10:00:00.000Z" },
    "token": "<jwt>"
  }
  ```
- `400 Bad Request` — missing fields.
- `401 Unauthorized` — `{ "error": "Invalid email or password." }`. Returned for both "no such user" and "wrong password" (spec FR-008).

**Token claims** (HS256-signed):

| Claim | Source |
|-------|--------|
| `sub` | `User.id` as a string |
| `iat` | issuance time |
| `exp` | `iat + JWT_TTL` (default 7 days) |

No additional custom claims in this iteration.

---

## POST `/api/auth/logout`

Acknowledge that the client is discarding its token.

**Auth required**: Bearer token (`Authorization: Bearer <jwt>`). Missing/invalid token still returns `204` — logout is idempotent and never fails.

**Request body**: none.

**Responses**:

- `204 No Content` — server takes no action (stateless JWT; see research Decision 3).

**Note**: This endpoint exists for symmetry and for the future hardening pass where it will revoke the token server-side. Frontend code MUST also clear the token from local storage on logout — the server cannot enforce this in the current iteration.
