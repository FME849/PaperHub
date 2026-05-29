# Frontend Integration Guide: Password Reset

**Audience**: frontend engineer integrating against the `005-password-reset-email` backend.
**Status**: as-built — reflects what the backend actually returns, not the planning contract. Where this doc and `contracts/*.md` disagree, **this doc wins**.
**Prerequisites**: you already have `001-user-auth` (register/login, JWT bearer) integrated. This feature adds the forgotten-password recovery flow. No authentication is required for any of these endpoints.

---

## 1. Quick orientation

- Base URL (dev): `http://localhost:4000`
- All three endpoints are **unauthenticated** (a locked-out user has no session). Authorisation for the password change is possession of a valid reset token.
- Content type: `application/json` on requests with a body.

What this feature adds:

| # | Method | Path | What it does | Story |
|---|---|---|---|---|
| 1 | `POST` | `/api/auth/forgot-password` | Request a reset link by email; always neutral response | US1 |
| 2 | `GET`  | `/api/auth/reset-password?token=…` | Pre-check whether a token is still valid | US2 |
| 3 | `POST` | `/api/auth/reset-password` | Set a new password using the token | US2 |

What this feature **does NOT** ship (don't build UI for):

- No "security questions", SMS, or alternative recovery channels — email only.
- No passwordless / magic-link login. The reset link only authorizes a **password change**, not a logged-in session — after reset, send the user to the normal login page.
- No "resend" affordance beyond calling `forgot-password` again (which is rate-limited).
- The reset **email** is rendered by the backend; you don't build it. You build the two **pages** the flow needs (see §6).

---

## 2. Error envelope (read once)

Same plain shape as `001`–`004`:

```ts
type ErrorResponse = {
  error: string;       // human-readable
  details?: unknown;   // present only for 400 VALIDATION_FAILED (Zod flatten())
};
```

| HTTP | When | Handling |
|---|---|---|
| 200 | success | Render next step. |
| 400 | malformed input, **weak password**, or invalid/expired/used token | See per-endpoint notes — distinguish by which call you made. |
| 429 | too many attempts (verify/reset, per IP) | "Too many attempts. Please try again later." |

> **Anti-enumeration**: `forgot-password` **never** reveals whether an email is registered — it always returns the same `200` body, even when rate-limited. Don't build UI that implies "email found / not found".

---

## 3. Forgot-password form (US1)

A page with a single email field. On submit, call:

### `POST /api/auth/forgot-password`

```http
POST /api/auth/forgot-password
Content-Type: application/json

{ "email": "user@example.com" }
```

**`200 OK`** — always this neutral body, regardless of whether the account exists or the request was throttled:

```json
{ "message": "If an account exists for that address, a password reset link has been sent." }
```

**`400 VALIDATION_FAILED`** — only for a **malformed** email (not "unknown account"):

```json
{ "error": "Validation failed.", "details": { "fieldErrors": { "email": ["Email is not valid."] } } }
```

**UX:**

- After a `200`, show a neutral confirmation screen: *"If that email is registered, we've sent a reset link. Check your inbox (and spam)."* Do **not** say "email sent" in a way that confirms the account exists.
- The email is sent **asynchronously** — the `200` returns immediately; delivery follows within seconds. Don't wait/poll.

---

## 4. Reset-password page (US2)

The email link points to `${FRONTEND_BASE_URL}/reset-password?token=<raw>`. **You build this route.** Read the `token` from the query string.

### Step 1 (recommended): validate the token on page load

### `GET /api/auth/reset-password?token=<raw>`

```http
GET /api/auth/reset-password?token=Zk9...base64url
```

**`200 OK`**:

```json
{ "valid": true }
```

```json
{ "valid": false }
```

- `valid: true` → render the "choose a new password" form.
- `valid: false` → render an "expired / invalid link" state with a button back to the forgot-password page. (Avoids making the user type a new password into a dead link.)
- **`429`** → too many checks from this IP; back off.

This call does **not** consume the token; it's a read-only pre-check.

### Step 2: submit the new password

### `POST /api/auth/reset-password`

```http
POST /api/auth/reset-password
Content-Type: application/json

{ "token": "Zk9...base64url", "newPassword": "newStrongPass123" }
```

`newPassword` must meet the same rules as `001` registration: **≥ 8 chars, at least one letter and one digit**. Validate client-side too for a better UX.

**`200 OK`**:

```json
{ "message": "Your password has been reset. You can now log in with your new password." }
```

→ Redirect to the **login** page (the user is NOT auto-logged-in). Show a success toast.

**`400 VALIDATION_FAILED`** — two distinct cases, both `400`:

```jsonc
// (a) weak / missing newPassword — the token is NOT consumed; the form is still usable
{ "error": "Validation failed.", "details": { "fieldErrors": { "newPassword": ["Password must contain a digit."] } } }

// (b) invalid / expired / already-used token — generic message; send the user back to forgot-password
{ "error": "This reset link is invalid or has expired. Please request a new one." }
```

Distinguish by presence of `details.fieldErrors.newPassword`: if present → it's a password-strength problem (keep the form, show the field error). If absent → the **link** is dead (route to forgot-password).

**`429`** → too many submit attempts from this IP.

---

## 5. Important behaviors to reflect in UX

- **Single-use**: once a reset succeeds, that link is dead. If the user reloads and resubmits, they'll get the generic `400` link-dead message — route them to forgot-password.
- **Expiry**: links expire after **60 minutes** (the email states this). Expired → generic `400` / `{valid:false}`.
- **Supersede**: if the user requests a reset twice, only the **most recent** link works; older links go dead.
- **All sessions logged out**: a successful reset invalidates every existing session for that account. If the user happened to be logged in elsewhere, those sessions will start returning `401` on their next request — your app's normal `401 → login` handling covers this; no special UI needed.

---

## 6. Pages you need to build (summary)

| Route | Purpose | Calls |
|---|---|---|
| `/forgot-password` | Email entry form + neutral confirmation screen | `POST /api/auth/forgot-password` |
| `/reset-password` (reads `?token=`) | Validate link, then "choose a new password" form → on success redirect to login | `GET` + `POST /api/auth/reset-password` |

Wire a "Forgot your password?" link on the existing login page to `/forgot-password`. Everything else (token generation, email, expiry, single-use, session invalidation) is backend-owned.

---

## 7. End-to-end smoke (FE-side)

1. From login, click "Forgot your password?" → enter a registered email → see neutral confirmation.
2. Open the email (Mailpit in dev — see `quickstart.md` / `../004-paper-email-notifications/gmail-smtp-setup.md` for real inbox) → click the reset link.
3. Page validates the token (`{valid:true}`) → enter a new strong password → submit → redirected to login.
4. Log in with the new password (works); old password fails.
5. Reload the reset link → "invalid or expired" state → routed to forgot-password.
