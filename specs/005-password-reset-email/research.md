# Phase 0 Research: Password Reset via Email

Resolves every technical unknown in [plan.md](./plan.md) Technical Context. Each decision records rationale and rejected alternatives.

---

## Decision 1 — Reset token shape and storage

**Decision**: The raw token is **`crypto.randomBytes(32)` encoded base64url** (256 bits of entropy). Only its **SHA-256 hash** is persisted (`PasswordResetRequest.tokenHash`, unique). The raw token appears only in the emailed link. Verification hashes the presented token with SHA-256, looks up the row by `tokenHash`, then confirms with `crypto.timingSafeEqual`.

**Rationale**:

- 256 random bits is infeasible to brute-force (FR-005 "cryptographically secure", SC-006).
- Storing only the hash means a database leak does not expose usable links (FR-015 "hashed at rest").
- The token is opaque random bytes — it encodes **no** user id, email, or other PII (FR-015 "expose no user information"). The account is found via the `tokenHash → userId` row, not by decoding the token.
- SHA-256 (not bcrypt) is correct here: the token is already high-entropy, so a fast hash is fine and lets us do an indexed `tokenHash` lookup. Bcrypt would prevent the indexed lookup and add no security for a 256-bit random secret.

**Alternatives considered & rejected**:

- **Signed JWT as the token** — self-describing, but encodes claims (enumerable), can't be invalidated without server state anyway, and is larger in the URL. Rejected; FR-015 wants an opaque, info-free token.
- **Store the raw token in plaintext** — a DB leak then hands out working reset links. Rejected (FR-015).
- **bcrypt the token** — defeats the indexed `tokenHash` lookup and adds cost with no benefit for a random 256-bit value. Rejected.

---

## Decision 2 — Prior-session invalidation mechanism (the one notable existing-code change)

**Decision**: Add **`User.passwordChangedAt DateTime?`**. On any password mutation (reset completion **and** `001`'s authenticated change-password), set `passwordChangedAt = now()`. The `authenticate` middleware reads the user and **rejects any JWT whose `iat` (issued-at) is earlier than `passwordChangedAt`**. `jsonwebtoken` already stamps `iat` automatically, so existing tokens need no change.

**Rationale**:

- `001` issues stateless JWTs with a 7-day TTL and `authenticate` does a pure verify with **no DB read**. A stolen or pre-reset token would otherwise stay valid for up to 7 days after the user resets — directly violating FR-010.
- Comparing token `iat` (seconds) to `passwordChangedAt` invalidates *every* token minted before the reset in one comparison, with no per-token storage.
- This is the standard "password changed ⇒ log out everywhere" pattern.

**Cost / trade-off** (also in plan.md Complexity Tracking): `authenticate` now performs one indexed primary-key lookup per authenticated request across all of `002`/`003`/`004`. Negligible at this scale; if it ever matters, the user row (just `id` + `passwordChangedAt`) is trivially cacheable.

**Alternatives considered & rejected**:

- **Token denylist / allowlist** — requires storing and looking up every issued token; strictly more work than one timestamp compare. Rejected.
- **`tokenVersion` integer on User, embedded as a JWT claim** — equivalent power; chosen `passwordChangedAt` instead because it doubles as useful audit metadata and needs no new JWT claim (uses the automatic `iat`). Either is acceptable; documented so implementation can pick `tokenVersion` if preferred.
- **Do nothing, rely on `JWT_TTL` expiry** — leaves a multi-day window of valid pre-reset tokens. Rejected (FR-010).
- **Shorten `JWT_TTL`** — degrades UX for everyone and still leaves a window. Rejected.

---

## Decision 3 — Asynchronous send + bounded retry

**Decision**: The `forgot-password` handler creates the reset row, writes the `REQUESTED` audit event, returns the neutral confirmation, and **dispatches the email send without awaiting it** (fire-and-forget via an async function not tied to the response). The send function retries on transient failure up to `PASSWORD_RESET_MAX_SEND_RETRIES` (default 3) with a fixed backoff (`PASSWORD_RESET_RETRY_BACKOFF_MS`, default 2000 ms), recording the final outcome (`COMPLETED`-send / `SEND_FAILED` / `RETRY_EXHAUSTED`) on the audit log. Hard failures (e.g. `550`) are not retried.

**Rationale**:

- Async dispatch is what makes SC-009 (sub-second response) and FR-003's no-timing-oracle property hold — the response is sent before the expensive token-hash + SMTP work, so response latency does not reveal account existence.
- In-process retry with backoff recovers from transient provider blips (SC-011) without a queue.
- Matches `004`'s explicit "no durable queue in v1" stance; the scale (rare, human-paced resets) does not justify a worker process.

**Trade-off**: a process crash mid-retry can drop an in-flight reset email. Acceptable because resets are rare and the user can simply re-request (subject to rate limits). A durable queue is the v2 upgrade path.

**Alternatives considered & rejected**:

- **Await the send in the request** — blocks the response on provider latency (breaks SC-009) and creates a timing oracle (known email = slow, unknown = fast → enumeration). Rejected.
- **Durable queue (BullMQ / pg-boss)** — adds a process + dependency the project lacks. Rejected for v1.
- **DB-polled retry worker** — more durable but reintroduces a background loop; deferred to v2 alongside the queue.

---

## Decision 4 — Rate limiting

**Decision**: A small **in-process fixed-window limiter** (`middleware/rateLimit.ts`) keyed independently by **(a) normalized email** and **(b) client IP**, applied to `POST /forgot-password`; a separate IP-keyed limiter guards `POST /reset-password` and `GET /reset-password` (link verification) against brute force. Limits/windows come from env (`PASSWORD_RESET_RATE_LIMIT_PER_EMAIL`, `PASSWORD_RESET_RATE_LIMIT_PER_IP`, `PASSWORD_RESET_RATE_LIMIT_WINDOW_MS`). When throttled, `forgot-password` still returns the **neutral** confirmation (never reveals the limit was hit per-account); link-verification returns `429`.

**Rationale**:

- FR-012 (request throttling) and FR-013 (link-submission throttling) require limits; the project has no Redis/shared cache and runs single-process in dev.
- A fixed-window `Map<key, {count, windowStart}>` is ~30 lines, dependency-free, and sufficient at this scale.
- Keying `forgot-password` by **both** email and IP stops both "hammer one victim's address" and "spray many addresses from one host".

**Trade-off**: in-process state resets on restart and is per-instance (not shared across a multi-instance deployment). Documented; the Redis-backed variant is the multi-instance v2 path.

**Alternatives considered & rejected**:

- **`express-rate-limit`** — fine library, but a dependency for a handful of routes when a tiny map suffices; its default store is also in-memory. Rejected for v1 minimalism.
- **DB-counted limits via the audit table** — durable but adds a write+aggregate per request on the hot anti-abuse path. Rejected; the audit table still records throttle events for observability, but enforcement is in-memory.

---

## Decision 5 — Enumeration & timing defence

**Decision**: `forgot-password` returns an identical body and `200` status for known, unknown, deactivated, and throttled emails. The account lookup result only changes what happens **after** the response (dispatch email vs. write a `SUPPRESSED_NO_ACCOUNT` audit event). Because the email work is async (Decision 3), the synchronous response path is the same length regardless of account existence.

**Rationale**: FR-003/FR-014/SC-003 require no enumeration via content **or** timing. Doing all account-dependent work post-response removes the timing signal without artificial sleeps.

**Alternatives considered & rejected**:

- **Constant-time padding / fixed artificial delay** — fragile and wastes latency; unnecessary once the account-dependent work is moved off the response path. Rejected.
- **Different status codes for unknown email** — direct enumeration leak. Rejected.

---

## Decision 6 — Email template approach

**Decision**: A **handwritten responsive HTML + plain-text** reset template in `services/email-templates/password-reset.ts`, mirroring `004`'s digest template approach. Inline styles, table-based layout, a single prominent "Reset your password" button/link to `${FRONTEND_BASE_URL}/reset-password?token=…`, and an explicit **"This link expires in N minutes"** notice (FR-020).

**Rationale**: Reuses the exact pattern `004` already established (one typed payload, HTML + text from the same input, no framework). FR-020's "responsive HTML" is met with the same inline-style/table approach that renders across clients.

**Alternatives considered & rejected**:

- **`react-email` / `mjml`** — rejected for the same reasons as in `004` (dependency/build-step for a one-template feature).
- **Plain-text only** — fails FR-020 (responsive HTML required).

---

## Decision 7 — Endpoint placement & shape

**Decision**: Three endpoints on the **existing `/api/auth` router**:

- `POST /api/auth/forgot-password` — `{ email }` → always `200` neutral (rate-limited per email + IP).
- `POST /api/auth/reset-password` — `{ token, newPassword }` → `200` on success, `400` invalid/expired/used, `422` weak password (rate-limited per IP).
- `GET /api/auth/reset-password?token=…` — lightweight pre-check so the FE can show the form or an "expired, request again" state without submitting a password. Returns `{ valid: boolean }` (rate-limited per IP).

**Rationale**: These are authentication-domain operations, so they belong with register/login on `authRouter` rather than a new router. The optional `GET` validate endpoint improves FE UX (avoid asking the user to type a new password into a dead link) and only reveals token validity (not account existence), which is acceptable.

**Alternatives considered & rejected**:

- **A new `/api/password-reset` router** — unnecessary surface; resets are part of auth. Rejected.
- **Omit the validate endpoint** — FE would only learn the link is dead after the user types a new password. Kept it for UX; it is rate-limited to prevent it becoming a brute-force oracle.

---

## Decision summary

| # | Topic | Decision |
|---|-------|----------|
| 1 | Token | `randomBytes(32)` base64url; store SHA-256 hash only; no user info in token |
| 2 | Session invalidation | `User.passwordChangedAt`; `authenticate` rejects JWT with `iat` < `passwordChangedAt` |
| 3 | Send | Fire-and-forget async dispatch; in-process bounded retry with backoff |
| 4 | Rate limiting | In-process fixed-window limiter, keyed by email + IP (request) and IP (verify) |
| 5 | Enumeration | Identical neutral response; account-dependent work done after the response (no timing oracle) |
| 6 | Email template | Handwritten responsive HTML + text with expiry notice (reuses `004`'s approach) |
| 7 | Endpoints | `POST /forgot-password`, `POST /reset-password`, `GET /reset-password` (validate) on `authRouter` |

All spec checklist "open clarification candidates" (session-invalidation mechanism, link lifetime, retry policy) are resolved here. The plan proceeds to Phase 1 with no unresolved unknowns.
