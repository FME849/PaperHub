---
description: "Implementation task list for feature 005-password-reset-email"
---

# Tasks: Password Reset via Email

**Input**: Design documents from `/specs/005-password-reset-email/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Automated tests are NOT in scope for this feature, matching the `001`–`004` precedent. Verification is via the manual quickstart walk-through.

**Organization**: Tasks are grouped by user story (US1, US2, US3). The MVP is US1 + US2 (both P1) — request a link and complete a reset. US3 (P2) hardens the flow.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1, US2, US3
- Paths are repo-relative; working directory at execution time is `/Users/fme849/Personal/Project/PaperHub`.

## Path Conventions

Web application — `backend/` and `Frontend/` at the repo root. This feature is **backend-only**; no `Frontend/` files are touched. Reset endpoints live on the existing `authRouter` (`/api/auth/*`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Declare the new configuration knobs. No new dependency (token uses Node `crypto`; email reuses `004`'s Nodemailer client; hashing reuses `001`'s `bcryptjs`).

- [ ] T001 [P] Add password-reset env vars to `backend/src/config/env.ts` using the existing `optionalNumber` helper (all have safe defaults so the server still boots with no `.env` edits): `PASSWORD_RESET_TOKEN_TTL_MINUTES` (60), `PASSWORD_RESET_MAX_SEND_RETRIES` (3), `PASSWORD_RESET_RETRY_BACKOFF_MS` (2000), `PASSWORD_RESET_RATE_LIMIT_PER_EMAIL` (5), `PASSWORD_RESET_RATE_LIMIT_PER_IP` (15), `PASSWORD_RESET_RATE_LIMIT_WINDOW_MS` (900000). Per [plan.md § Technical Context].
- [ ] T002 [P] Append the same keys with documented defaults to `backend/.env.example` under a "Password reset (005)" heading, referencing [quickstart.md § 3].

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, repositories, the rate-limit middleware, the reset email template, the email-service method, validation schemas, and the shared password-mutation path. Everything in Phase 3+ depends on this phase.

**⚠️ CRITICAL**: No user-story work can begin until Phase 2 is complete.

- [ ] T003 Update `backend/prisma/schema.prisma` per [data-model.md]: add `User.passwordChangedAt DateTime?` and the `passwordResetRequests` / `passwordResetEvents` back-relations; add `PasswordResetRequest` (+ `PasswordResetInvalidationReason` enum) and `PasswordResetAuditEvent` (+ `PasswordResetEventType` enum). Run `npx prisma format`.
- [ ] T004 From `backend/`, run `npx prisma migrate dev --name password_reset` to create `backend/prisma/migrations/0005_password_reset/migration.sql`; verify it matches the reference SQL in [data-model.md]; then `npx prisma generate`.
- [ ] T005 [P] Create `backend/src/repositories/passwordResetRequest.repository.ts`: `create({ userId, tokenHash, expiresAt })`, `findValidByTokenHash(tokenHash)` (unconsumed, non-invalidated, `expiresAt > now`), `markConsumed(id)` (set `consumedAt`, `invalidationReason = USED`), `invalidateActiveForUser(userId, reason)` (set `invalidatedAt` + reason on all active rows), `recordSendOutcome(id, attempts, outcome)`. All Prisma access lives here. Per [data-model.md].
- [ ] T006 [P] Create `backend/src/repositories/passwordResetAuditEvent.repository.ts`: `record({ userId?, eventType, emailAttempted?, ipHash?, detail? })`. Per [data-model.md].
- [ ] T007 [P] Modify `backend/src/repositories/user.repository.ts`: change `updatePasswordHash(id, hash)` to also set `passwordChangedAt = new Date()` in the same update. (Existing callers continue to work; the column is additive.)
- [ ] T008 [P] Create `backend/src/middleware/rateLimit.ts`: an in-process fixed-window limiter factory `createRateLimiter({ limit, windowMs, keyFn })` returning Express middleware that 429s when the per-key count in the window is exceeded, plus a non-middleware `checkAndConsume(key)` helper so the `forgot-password` handler can throttle **without** sending a 429 (it returns the neutral 200 instead). Keep an in-memory `Map<key,{count,windowStart}>`; document single-instance limitation. Per [research.md Decision 4].
- [ ] T009 [P] Create `backend/src/services/email-templates/password-reset.ts`: `renderPasswordResetHtml(payload)` and `renderPasswordResetText(payload)` from one typed `PasswordResetEmailPayload` (`resetUrl`, `expiresInMinutes`). Responsive (inline styles, table layout), a prominent "Reset your password" link, and an explicit "This link expires in N minutes" notice. Mirror `004`'s `email-templates/digest.ts` style. Per [research.md Decision 6] / FR-020.
- [ ] T010 Modify `backend/src/services/email.service.ts` (from `004`): add `sendPasswordReset({ recipientEmail, resetUrl, expiresInMinutes })` that composes via T009 and sends through the existing `emailClient`. Subject e.g. `"Reset your PaperHub password"`. Returns the same `EmailSendResult` type as `004`'s send path. (Depends on T009.)
- [ ] T011 [P] Add validation schemas to `backend/src/validation/schemas.ts`: `forgotPasswordSchema` (`{ email }`, reuse the existing `emailSchema`), `resetPasswordSchema` (`{ token: string min 1, newPassword: <001's passwordStrengthSchema> }`), `resetTokenQuerySchema` (`{ token: string min 1 }`). Export inferred types.
- [ ] T012 Create the shared password-mutation path: in `backend/src/services/auth.service.ts` add `setPassword(userId, newPlaintextPassword)` that bcrypt-hashes (reuse `BCRYPT_COST`), calls `userRepository.updatePasswordHash` (now also bumps `passwordChangedAt` via T007), and calls `passwordResetRequestRepository.invalidateActiveForUser(userId, "PASSWORD_CHANGED")`. Then refactor `backend/src/services/users.service.ts` `changePassword` to verify the current password and delegate the actual mutation to `authService.setPassword` (satisfies FR-011 for the authenticated change-password path). (Depends on T005, T007.)

**Checkpoint**: Schema migrated; repositories, rate limiter, email template + send method, validation schemas, and the shared `setPassword` exist. User stories can begin.

---

## Phase 3: User Story 1 - Request a password reset link (Priority: P1) 🎯 MVP (part 1)

**Goal**: An unauthenticated user submits an email; the system always returns the same neutral confirmation, and — only when the account exists — creates a single-use, time-limited reset row (superseding any prior active one) and dispatches a responsive reset email asynchronously with bounded retry. No account enumeration, no timing oracle, rate-limited.

**Independent Test**: per [spec.md § US1 Independent Test] — submit a known email → exactly one email in Mailpit with a working `…/reset-password?token=…` link and expiry notice; submit an unknown email → identical on-screen response, no email; submit a malformed email → 400.

### Implementation for User Story 1

- [ ] T013 [P] [US1] Create `backend/src/services/passwordReset.service.ts` with token helpers `generateToken(): { raw, hash }` (`crypto.randomBytes(32).toString("base64url")`; `hash = sha256(raw)` hex) and `hashToken(raw)`; and `requestReset({ email, ipHash }): Promise<void>` which: looks up the user (lowercased email); if none → record `SUPPRESSED_NO_ACCOUNT` audit and return; if found → `invalidateActiveForUser(userId, "SUPERSEDED")`, create a `PasswordResetRequest` (`expiresAt = now + PASSWORD_RESET_TOKEN_TTL_MINUTES`), record `REQUESTED` audit, then dispatch the email **without awaiting** (see T014). Per [research.md Decision 1, 3, 5].
- [ ] T014 [US1] In `passwordReset.service.ts`, add the async send dispatcher `dispatchResetEmail(requestId, recipientEmail, rawToken)`: builds `resetUrl = ${FRONTEND_BASE_URL}/reset-password?token=${rawToken}`, calls `emailService.sendPasswordReset`, retries transient failures up to `PASSWORD_RESET_MAX_SEND_RETRIES` with `PASSWORD_RESET_RETRY_BACKOFF_MS` backoff, records `sendAttempts`/`lastSendOutcome` on the row and `SEND_FAILED`/`RETRY_EXHAUSTED` audit events; the whole dispatcher is wrapped so a failure never throws into the (already-returned) request path. (Depends on T010, T013.)
- [ ] T015 [US1] Create `backend/src/controllers/password-reset.controller.ts` with `forgotPassword(req,res)`: Zod-parse with `forgotPasswordSchema` (400 on malformed); compute `ipHash` from the client IP; send the neutral `200` response **first**, then invoke `passwordResetService.requestReset(...)` (account-dependent work happens after the response — no timing oracle, FR-003). (Depends on T011, T013.)
- [ ] T016 [US1] Wire the route in `backend/src/routes/auth.routes.ts`: `POST /forgot-password` guarded by two rate limiters from T008 — per normalized email and per IP. On throttle, the handler still returns the neutral `200` and records a `THROTTLED` audit event (never a per-account 429). (Depends on T008, T015.)

**Checkpoint**: US1 testable — request flow sends exactly one async email for real accounts, identical neutral response otherwise, rate-limited. FR-001/002/003/004/007/012/017/018/019/020/021/023 exercised on the request side.

---

## Phase 4: User Story 2 - Set a new password using the link (Priority: P1) 🎯 MVP (part 2)

**Goal**: The user opens the emailed link, the token is validated before any password write, a strength-compliant new password is set via the shared `setPassword` path, the link is consumed (single-use), and login works with the new password. Invalid/expired/used/tampered tokens return a generic error.

**Independent Test**: per [spec.md § US2 Independent Test] — with a valid token: `GET /reset-password?token=…` → `{valid:true}`; `POST /reset-password` → 200; new password logs in, old fails; reusing the token → 400; expired token → 400; weak password → 422 with the link still usable.

### Implementation for User Story 2

- [ ] T017 [US2] In `backend/src/services/passwordReset.service.ts`, add `verifyToken(rawToken): Promise<boolean>` (hash → `findValidByTokenHash` → boolean; record `LINK_VERIFIED` audit on success) and `completeReset({ rawToken, newPassword }): Promise<void>` which: finds the valid row (else throw a generic invalid-link `DomainError(400)`), calls `authService.setPassword(userId, newPassword)` (which hashes, bumps `passwordChangedAt`, and invalidates active reset rows), then `markConsumed(rowId)` and records `COMPLETED` audit. Password-strength validation happens at the controller/Zod boundary so a weak password returns 422 **before** the token is consumed (link stays usable). (Depends on T012, T013.)
- [ ] T018 [US2] Add to `backend/src/controllers/password-reset.controller.ts`: `validateToken(req,res)` (Zod `resetTokenQuerySchema`; returns `{ valid }`) and `resetPassword(req,res)` (Zod `resetPasswordSchema`; on parse failure for `newPassword` → 422; calls `completeReset`; success → 200 message). Generic 400 message for invalid/expired/used tokens (no account disclosure). (Depends on T011, T017.)
- [ ] T019 [US2] Wire routes in `backend/src/routes/auth.routes.ts`: `GET /reset-password` (validate) and `POST /reset-password` (complete), both guarded by the per-IP rate limiter from T008 (429 on excess — anti brute-force, FR-013). (Depends on T008, T018.)

**Checkpoint**: US1 + US2 = full working reset (the MVP). A user can recover account access end-to-end. FR-005/006/008/009/013/014/016 exercised.

---

## Phase 5: User Story 3 - Recovery security and session safety (Priority: P2)

**Goal**: Harden the flow: a successful reset invalidates sessions established before it; password changes via any path invalidate outstanding links; expiry/supersede/single-use all hold; rate limiting is effective. The distinct net-new deliverable here is the `authenticate` session-invalidation check (the rest is wired in Phases 2–4 and verified here).

**Independent Test**: per [spec.md § US3 Independent Test] — a JWT minted before a reset is rejected after the reset; changing the password via `001`'s authenticated flow invalidates an outstanding reset link; links expire; a reissue supersedes the prior link; repeated requests/verifies are throttled.

### Implementation for User Story 3

- [ ] T020 [US3] Modify `backend/src/middleware/authenticate.ts`: after verifying the JWT, load the user (by `sub`) and reject with `AuthRequiredError` if `user` is missing OR (`user.passwordChangedAt` is set AND the token's `iat` seconds are earlier than `floor(passwordChangedAt/1000)`). Keep `req.userId` assignment on success. This enforces FR-010 across all authenticated endpoints. (Depends on T003/T004 for the column; reads via `userRepository.findById`.) Note the per-request lookup cost per [plan.md Complexity Tracking].
- [ ] T021 [US3] Verification pass (no new files): confirm FR-007 (reissue supersedes — T013), FR-009 (single-use — T017 `markConsumed`), FR-011 (authenticated change-password invalidates reset rows — T012), and the rate-limit + `THROTTLED` audit behavior (T016/T019) all hold together by walking [quickstart.md §§ 8–11]. Fix any gaps found in the owning task's file.

**Checkpoint**: All three stories functional and hardened. FR-010/011 and SC-005 demonstrable; rate-limit and supersede/expiry/single-use verified.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T022 [P] Run `npm run lint` (`tsc --noEmit`) from `backend/`; resolve any errors. No `any`; `unknown` only at Zod boundaries.
- [ ] T023 [P] Add the `PASSWORD_RESET_*` keys to the local gitignored `backend/.env` (defaults are fine) so the quickstart runs without surprises, then run [quickstart.md] end-to-end against Mailpit: ticking happy path (§5–7), enumeration check (§5), single-use + expiry (§8), supersede (§9), session invalidation (§10), rate limiting (§11), and the audit/no-secret check (§12).
- [ ] T024 [P] Confirm `requestLogger` already redacts `?token=` (added in `004`) so reset links never appear in logs; if the GET validate path logs the token anywhere else, redact it.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: T001, T002 — independent, parallel.
- **Foundational (Phase 2)**: T003 → T004 (schema before migrate). After T004: T005, T006, T007, T008, T009, T011 are all `[P]`. T010 depends on T009. T012 depends on T005 + T007. **Blocks all stories.**
- **US1 (Phase 3)**: T013 `[P]` (needs T005/T006); T014 needs T010 + T013; T015 needs T011 + T013; T016 needs T008 + T015.
- **US2 (Phase 4)**: T017 needs T012 + T013; T018 needs T011 + T017; T019 needs T008 + T018. US2 depends on US1 only for the shared `passwordReset.service.ts` file (T013) — they touch the same service, so coordinate if worked in parallel.
- **US3 (Phase 5)**: T020 needs the `passwordChangedAt` column (T003/T004) — independent of US1/US2 code and can be done right after Phase 2. T021 is a verification pass after US1+US2.
- **Polish (Phase 6)**: after the desired stories.

### Within each story

Models/schema → repositories → services → controllers → routes → middleware wiring.

### Parallel opportunities

- **Setup**: T001 + T002.
- **Foundational**: T005, T006, T007, T008, T009, T011 in parallel after T004; then T010 (after T009) and T012 (after T005/T007).
- **US1**: T013 in parallel with US2's T017 only if the shared service file is split carefully; otherwise sequential within `passwordReset.service.ts`.
- **US3 T020** can be implemented immediately after Phase 2, in parallel with US1/US2 (different file: `authenticate.ts`).
- **Polish**: T022, T023, T024 in parallel.

---

## Parallel Example: Foundational phase

```bash
# After T004 (migration) completes, run the independent foundational pieces together:
Task: "passwordResetRequest.repository.ts (T005)"
Task: "passwordResetAuditEvent.repository.ts (T006)"
Task: "user.repository.ts passwordChangedAt write (T007)"
Task: "middleware/rateLimit.ts (T008)"
Task: "email-templates/password-reset.ts (T009)"
Task: "validation schemas (T011)"
# then T010 (email.service, after T009) and T012 (shared setPassword, after T005+T007).
```

---

## Implementation Strategy

### MVP (User Stories 1 + 2 — both P1)

1. Phase 1 Setup (T001–T002).
2. Phase 2 Foundational (T003–T012). **Do not skip the migration — all downstream tasks need the generated Prisma types.**
3. Phase 3 US1 (T013–T016) + Phase 4 US2 (T017–T019).
4. **STOP and VALIDATE**: run [quickstart.md §§ 4–8] with Mailpit — request → email → set new password → login works, old fails, token single-use.

### Incremental delivery

1. Setup + Foundational → ready.
2. US1 + US2 → MVP (working recovery). Demo.
3. US3 → session invalidation + hardening. Demo.
4. Polish.

### Notes

- Backend-only iteration. The FE teammate builds the "Forgot password?" form (consumes `POST /forgot-password`) and the `/reset-password` page (consumes `GET`/`POST /reset-password`); the contract in [contracts/password-reset.md] is the handoff.
- Email reuses `004`'s isolated client (`external/email.client.ts`) and `email.service.ts` — only a new template + `sendPasswordReset` method are added (FR-023).
- The `authenticate` change (T020) is the only modification to a hot path shared by `002`/`003`/`004`; it adds one indexed user lookup per authenticated request (acceptable at this scale; see [plan.md Complexity Tracking]).
- All `PASSWORD_RESET_*` env vars have safe defaults, so the server boots without `.env` edits (unlike `004`'s required `UNSUBSCRIBE_TOKEN_SECRET`).
- Commit after each task or logical group. Stop at any checkpoint to validate independently.
