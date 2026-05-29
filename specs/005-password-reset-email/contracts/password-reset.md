# REST Contract: Password Reset

**Resource**: the password-reset flow for an account. Extends the existing `/api/auth` surface from `001-user-auth`.

**Base path**: `/api/auth`

**Authentication**: **none** — all three endpoints are unauthenticated by design (a locked-out user has no session). Authorisation for the password change is the possession of a valid reset token.

Error envelope (consistent with `001`–`004`):

```json
{ "error": "Human-readable message", "details": { /* optional, Zod flatten() */ } }
```

Status codes used: `200 OK`, `400 VALIDATION_FAILED` (malformed input, weak password, or invalid/expired/used token), `429 RATE_LIMITED`.

> **As-built note**: weak-password rejection returns **`400 VALIDATION_FAILED`** (the project-wide convention from `001`'s register/change-password via the shared `ValidationFailedError`), not `422`. Behaviorally it still happens **before** the token is consumed, so the link stays usable for another attempt (US2 scenario 5).

A core security rule applies across all three: **no response ever reveals whether a given email is registered** (FR-003, FR-014).

---

## `POST /api/auth/forgot-password` — request a reset link

Always returns the **same** neutral `200` response whether or not the email matches an account, and whether or not it was throttled (the throttle still returns the neutral body, never a per-account `429` that would leak existence). Rate-limited per email **and** per client IP.

### Request

```http
POST /api/auth/forgot-password
Content-Type: application/json

{ "email": "user@example.com" }
```

| Field | Type | Notes |
|---|---|---|
| `email` | string | Required. Validated as an email; lowercased. Malformed → `400`. |

### Responses

**`200 OK`** — neutral confirmation, identical for all cases:

```json
{ "message": "If an account exists for that address, a password reset link has been sent." }
```

- If the email matches an active account: a reset row is created (superseding any prior active one), and an email is **dispatched asynchronously** (the response does not wait for delivery — SC-009).
- If the email matches no account / a deactivated account: **no email is sent**; a `SUPPRESSED_NO_ACCOUNT` audit event is recorded. Response is identical.
- If the request is throttled: response is still identical; a `THROTTLED` audit event is recorded.

**`400 VALIDATION_FAILED`** — `email` missing or malformed:

```json
{ "error": "Validation failed.", "details": { "fieldErrors": { "email": ["Email is not valid."] } } }
```

### Side effects

- On account match: insert `PasswordResetRequest` (hashed token, `expiresAt = now + TTL`), invalidate prior active requests (`SUPERSEDED`), dispatch async send with bounded retry, write `REQUESTED` audit event.
- Account-dependent work happens **after** the response is sent (no timing oracle, FR-003).

---

## `GET /api/auth/reset-password?token=<raw>` — validate a link (UX pre-check)

Lets the frontend decide whether to render the "set a new password" form or an "expired — request a new link" state, without submitting a password. Rate-limited per IP (anti brute-force).

### Request

```http
GET /api/auth/reset-password?token=Zk9...base64url
```

| Query param | Notes |
|---|---|
| `token` | Required. The raw token from the email link. |

### Responses

**`200 OK`**:

```json
{ "valid": true }
```

```json
{ "valid": false }
```

- `valid` is `true` iff the token hashes to a `PasswordResetRequest` that is unconsumed, non-invalidated, and unexpired.
- Reveals only **token** validity, never account existence. A `LINK_VERIFIED` audit event is written on `valid: true`.

**`400 VALIDATION_FAILED`** — `token` query param missing.

**`429 RATE_LIMITED`** — too many verification attempts from this IP:

```json
{ "error": "Too many attempts. Please try again later." }
```

---

## `POST /api/auth/reset-password` — set a new password

Verifies the token, applies the new password (reusing `001`'s strength rules + hashing), consumes the link, bumps `passwordChangedAt` (invalidating prior sessions), and invalidates any other active reset rows for the account. Rate-limited per IP.

### Request

```http
POST /api/auth/reset-password
Content-Type: application/json

{ "token": "Zk9...base64url", "newPassword": "newStrongPass123" }
```

| Field | Type | Notes |
|---|---|---|
| `token` | string | Required. Raw token from the email link. |
| `newPassword` | string | Required. Must meet `001`'s password-strength rules (≥ 8 chars, a letter, a digit). |

### Responses

**`200 OK`**:

```json
{ "message": "Your password has been reset. You can now log in with your new password." }
```

- Token consumed (`consumedAt` set, reason `USED`); `User.passwordHash` updated; `User.passwordChangedAt = now()`; other active reset rows for the user invalidated; `COMPLETED` audit event written.

**`400`** — invalid / expired / already-used / unknown token. **Generic** message; does not distinguish the reason in a way that discloses account state:

```json
{ "error": "This reset link is invalid or has expired. Please request a new one." }
```

**`400 VALIDATION_FAILED`** — `newPassword` fails strength rules (parsed before the token is consumed, so the link remains usable for another attempt):

```json
{ "error": "Validation failed.", "details": { "fieldErrors": { "newPassword": ["Password must contain a digit."] } } }
```

**`429 RATE_LIMITED`** — too many submission attempts from this IP.

### Side effects

- On success: password mutation flows through the shared `setPassword` path so it is identical to `001`'s change-password (same hashing), plus session invalidation and reset-row invalidation.
- After success, the same token returns `400` (single-use), and pre-reset JWTs are rejected by `authenticate` on their next request (re-login required — FR-010).

---

## Cross-cutting

- All three endpoints sit on the existing `authRouter` (`/api/auth`), unauthenticated, and are logged by the existing `requestLogger` — which **redacts the `token` query param** (the redaction added in `004` already covers `?token=`).
- The reset email's link target is `${FRONTEND_BASE_URL}/reset-password?token=<raw>` — an FE route the FE teammate provides (see the frontend handoff).
- Neutral-response discipline (`forgot-password` and the generic `400` on `reset-password`) is the primary anti-enumeration control; the rate limiters are the anti-abuse control.
