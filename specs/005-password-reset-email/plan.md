# Implementation Plan: Password Reset via Email

**Branch**: `005-password-reset-email` | **Date**: 2026-05-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-password-reset-email/spec.md`

## Summary

Add a self-service password-recovery flow on top of `001-user-auth`, delivered over the transactional email capability built in `004-paper-email-notifications`. A locked-out user submits their email, receives a responsive HTML email with a cryptographically-random, single-use, time-limited reset link pointing at the frontend reset-password page, then sets a new password. Token verification, single-use consumption, expiry, supersede-prior-link, rate limiting, audit logging, asynchronous send with bounded retry, and prior-session invalidation are all in scope.

Three user stories, summarised:

- **US1 (P1)** — Request a reset link. Always returns a neutral confirmation (no account enumeration); an email is sent **asynchronously** only when the account exists.
- **US2 (P1)** — Set a new password using the emailed link. Token is verified before any password update; single-use; reuses `001`'s password-strength rules and hashing.
- **US3 (P2)** — Recovery security: expiry, single-use, supersede-on-reissue, invalidate-on-password-change, prior-session invalidation, and rate limiting on both request and link submission.

The one **architecturally significant** change to existing code: `001`'s `authenticate` middleware currently does a pure stateless JWT verify with **no DB read**. FR-010 (invalidate sessions established before a reset) cannot be satisfied by stateless JWTs alone, so this feature adds a `User.passwordChangedAt` column and a per-request check that rejects tokens issued before the last password change. This touches the hot path of every authenticated endpoint (`002`/`003`/`004`); the cost and the rejected alternatives are documented in **Complexity Tracking**.

Frontend integration is **deferred** for this iteration per the standing FE-reorg agreement. This plan ships the backend service, schema, REST contracts, the reset-email template, and an operator quickstart. The two FE pages (a "Forgot password?" form and a "reset-password" page that consumes the token) are the FE teammate's slice; the contracts here are the handoff.

## Technical Context

**Language/Version**: TypeScript 5.6 strict on backend; Node.js 20+ (inherited from `001`–`004`).

**Primary Dependencies** (no new runtime dependency):

- `crypto` (Node built-in) — `randomBytes` for the reset token, `createHash`/`timingSafeEqual` for hashed-at-rest storage and constant-time comparison.
- `bcryptjs` (existing) — password hashing, reused from `001` unchanged.
- `nodemailer` (from `004`) — reused via the existing `external/email.client.ts`; no new provider integration.
- No rate-limit library: a small in-process fixed-window limiter is added (`middleware/rateLimit.ts`). Rationale and the rejected Redis/library options are in [research.md](./research.md) Decision 4.

**Storage**: MySQL 8.x via Prisma, same instance as `001`–`004`. Two new tables: `PasswordResetRequest`, `PasswordResetAuditEvent`. One additive column on the existing `User`: `passwordChangedAt DateTime?`. New migration: `0005_password_reset` (additive only). See [data-model.md](./data-model.md).

**Testing**: Manual quickstart walk-through (`quickstart.md`), matching `001`–`004` precedent. Uses a local SMTP catcher (Mailpit) to inspect the rendered email, link, and expiry notice. Automated tests remain out of scope until a follow-up hardening pass.

**Target Platform**: Express REST API on port 4000, MySQL 8.x. Local dev on macOS/Linux; production deployment out of scope.

**Project Type**: Web application (backend-only this iteration; frontend deferred).

**Performance Goals**: No benchmarking required (project precedent). SC-009 ("request returns < 1s regardless of provider latency") is a correctness property guaranteed by asynchronous send (the handler does not await delivery), not a perf-tuning target. The new per-request `passwordChangedAt` check adds one indexed primary-key lookup to authenticated requests — negligible at this scale (< 100 users), noted in Complexity Tracking.

**Constraints**:

- **No account enumeration** (FR-003, FR-014, SC-003): the `forgot-password` handler MUST return the identical neutral response and status for known and unknown emails, and MUST avoid a timing oracle — the expensive work (token creation + email send) happens **after** the response is sent (async), so the response latency does not vary with account existence.
- **Token security** (FR-005, FR-015): the raw token is `crypto.randomBytes(32)` base64url-encoded; only its SHA-256 hash is stored. The token encodes no user data. Verification hashes the presented token and looks it up, then `timingSafeEqual`-compares.
- **Single active link** (FR-007): issuing a new request invalidates any prior active request for the same account (set `invalidatedAt`, reason `SUPERSEDED`).
- **Prior-session invalidation** (FR-010, FR-011): a successful reset — and `001`'s authenticated change-password — set `User.passwordChangedAt = now()` and invalidate outstanding reset requests; `authenticate` rejects any JWT whose `iat` predates `passwordChangedAt`.
- **Async + bounded retry** (FR-018, FR-019): the email send is dispatched without blocking the request; failures retry with backoff up to `PASSWORD_RESET_MAX_SEND_RETRIES`; outcome is recorded. Durability across process restart is a v2 concern (documented), consistent with `004`'s "no queue in v1" stance.
- **Email isolation** (FR-023): all provider access stays behind `external/email.client.ts` + `services/email.service.ts` from `004`; this feature adds a reset template and a `sendPasswordReset` method only.
- **Transactional/unconditional** (FR-017): reset emails ignore the `004` notification preference and bounce-quarantine entirely — recovery must work for opted-out users.

**Scale/Scope**: Pre-MVP local dev; < 100 users. Reset requests are rare and human-paced; the in-process rate limiter and fire-and-forget async send comfortably fit a single Node process.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Fixed Product Stack | PASS | Next.js + TS frontend (no FE changes this iteration), Express + TS backend (extending `001`–`004`), REST, MySQL + Prisma. No new external integration; email reuses `004`'s provider. |
| II. Layered Backend Architecture | PASS | Controllers (HTTP only): `password-reset.controller`. Services: `passwordReset.service` (orchestration), `email.service` (extended with `sendPasswordReset`), `auth.service`/`users.service` (share a single `setPassword` path). Repositories: `passwordResetRequest.repository`, `passwordResetAuditEvent.repository`, plus a `passwordChangedAt` write on `user.repository`. External client: reuses `external/email.client.ts`. |
| III. Strict TS + Async Code | PASS | strict mode, `async`/`await` throughout, no `any`. `unknown` only at HTTP body boundaries (Zod-narrowed). |
| IV. Isolated External and AI Services | PASS | Email-provider access stays in `external/email.client.ts` (from `004`); `passwordReset.service` depends on `email.service`, never on Nodemailer directly. No AI usage. Failures are caught at the service boundary; raw provider errors never reach the user (FR-017). |
| V. REST + Config + Data Discipline | PASS | New resource-oriented endpoints under `/api/auth` (`POST /forgot-password`, `POST /reset-password`, `GET /reset-password` validate). Meaningful status codes documented in [contracts/](./contracts/). Server-side Zod validation. New env vars centralised in `config/env.ts`. `.env.example` updated. Migration `0005_password_reset/`. |
| Repository Folder Rules | DEVIATION (inherited) | Frontend lives at repo root `/Frontend`. Backend-only feature; no impact. See **Complexity Tracking**. |
| Implementation Standards | PASS | Controllers parse, services orchestrate, repositories own Prisma. Token reset is idempotent against reuse (single-use consumption is schema-enforced via `consumedAt` + the verify check). Failed sends are caught, retried, logged; never crash the request path (FR-017/FR-019). |
| MVP Delivery Order | DEVIATION | Password reset is not on the constitution's enumerated MVP list (1–9). It is an explicit user-requested account-recovery slice whose prerequisites (`001` auth + email, `004` transactional email) are shipped. Mirrors `003`/`004` precedent of bundling user-requested slices adjacent to the named MVP list. See **Complexity Tracking**. |
| Default AI Provider Selection | N/A | No AI usage in this feature. |

Deviations are documented in **Complexity Tracking** with the simpler alternative considered. **Post-Phase-1 re-check** at the bottom confirms no new violations.

## Project Structure

### Documentation (this feature)

```text
specs/005-password-reset-email/
├── plan.md                  # This file
├── spec.md                  # Feature specification (resolved, no NEEDS CLARIFICATION)
├── research.md              # Phase 0 output
├── data-model.md            # Phase 1 output
├── quickstart.md            # Phase 1 output
├── contracts/               # Phase 1 output
│   └── password-reset.md    # POST /forgot-password, POST /reset-password, GET /reset-password (validate)
└── checklists/
    └── requirements.md      # Spec quality checklist (from /speckit-specify)
```

### Source Code (repository root)

```text
backend/                                            # EXTENDED from 001–004
├── .env.example                                    # MODIFIED: PASSWORD_RESET_* knobs
├── prisma/
│   ├── schema.prisma                               # MODIFIED: User.passwordChangedAt;
│   │                                               #           PasswordResetRequest (+ invalidation enum),
│   │                                               #           PasswordResetAuditEvent (+ event-type enum)
│   └── migrations/
│       └── 0005_password_reset/
│           └── migration.sql                       # NEW
└── src/
    ├── server.ts                                   # UNCHANGED (routes mount on existing authRouter)
    ├── config/
    │   └── env.ts                                  # MODIFIED: PASSWORD_RESET_TOKEN_TTL_MINUTES,
    │                                               #           PASSWORD_RESET_MAX_SEND_RETRIES,
    │                                               #           PASSWORD_RESET_RETRY_BACKOFF_MS,
    │                                               #           PASSWORD_RESET_RATE_LIMIT_* (per-email/per-ip/window)
    ├── middleware/
    │   ├── authenticate.ts                         # MODIFIED: reject JWT issued before User.passwordChangedAt
    │   └── rateLimit.ts                            # NEW: in-process fixed-window limiter factory
    ├── controllers/
    │   └── password-reset.controller.ts            # NEW: forgot / reset / validate handlers
    ├── services/
    │   ├── passwordReset.service.ts                # NEW: request + verify + complete orchestration, async dispatch
    │   ├── email.service.ts                        # MODIFIED from 004: add sendPasswordReset
    │   ├── email-templates/
    │   │   └── password-reset.ts                   # NEW: responsive HTML + text, expiry notice
    │   ├── auth.service.ts                         # MODIFIED: extract shared setPassword (hash + passwordChangedAt + invalidate resets)
    │   └── users.service.ts                        # MODIFIED: changePassword routes through shared setPassword
    ├── repositories/
    │   ├── passwordResetRequest.repository.ts      # NEW
    │   ├── passwordResetAuditEvent.repository.ts   # NEW
    │   └── user.repository.ts                      # MODIFIED: updatePasswordHash also sets passwordChangedAt; add findById select of passwordChangedAt (already returns full row)
    ├── routes/
    │   └── auth.routes.ts                          # MODIFIED: add forgot-password, reset-password (POST + GET validate), with rate-limit middleware
    └── validation/
        └── schemas.ts                              # MODIFIED: forgotPasswordSchema, resetPasswordSchema, resetTokenQuerySchema
Frontend/                                           # UNCHANGED this iteration (FE teammate owns the two pages)
```

**Structure Decision**: Single-feature backend extension on the established `001`–`004` layout. The reset endpoints live on the **existing `authRouter`** (`/api/auth/*`) since they are authentication-domain operations — no new top-level router. One new controller, one new orchestration service, one new email template, two new repositories, one new middleware (rate limiter), one migration. Existing files modified: `authenticate.ts` (session-invalidation check), `auth.service.ts`/`users.service.ts`/`user.repository.ts` (shared `setPassword`), `email.service.ts` (+`sendPasswordReset`), `auth.routes.ts`, `schemas.ts`, `env.ts`. No frontend changes.

## Complexity Tracking

| Violation / Cost | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `authenticate` now reads `User.passwordChangedAt` per request (was pure stateless JWT verify) | FR-010 requires invalidating sessions established before a reset. Self-contained JWTs cannot be revoked without a server-side check against per-user state. | **Do nothing / accept stale tokens until expiry**: leaves a stolen pre-reset JWT valid for up to `JWT_TTL` (7 days) after the legitimate user resets — defeats the security purpose of reset. **Token denylist**: needs storage of every issued token and a per-request lookup anyway; strictly more complex than one `passwordChangedAt` compare. **Shorten `JWT_TTL` drastically**: degrades UX for all users and still leaves a window. The single indexed PK lookup is the cheapest correct option at this scale. |
| In-process rate limiter (not Redis / not a library) | FR-012/FR-013 require throttling; the project has no shared cache or rate-limit infra and runs as a single process in dev. | **Redis token bucket**: adds infra the project doesn't have. **express-rate-limit dependency**: pulls a dependency for a handful of routes when a ~30-line fixed-window map suffices at this scale. The in-process limiter is documented as single-instance-only; a multi-instance deployment would need the Redis variant (v2). |
| Fire-and-forget async send + in-process retry (no durable queue) | FR-018/FR-019 require async send with retry; SC-009 requires sub-second request response. | **Durable queue/worker (BullMQ/pg-boss)**: adds a process + dependency to the deploy topology the project doesn't yet have; `004` already set the "no queue in v1" precedent. Trade-off documented: a process crash mid-retry can drop an in-flight reset email; the user can re-request (rare, human-paced). |
| Frontend at `/Frontend` not `/frontend` | Inherited from `001`; backend-only feature. | Repo-wide rename out of scope for a backend iteration. |
| Password reset not on the enumerated MVP list | Explicit user request; prerequisites (`001`, `004`) shipped. | Deferring until all 9 MVP items ship would block account recovery for no clarity gain; constitution allows explicit user-approved deviation. |

## Phase 0 (Research) and Phase 1 (Design) — outputs

- Phase 0 → [research.md](./research.md): decisions on token shape & storage, session-invalidation mechanism, async-send + retry strategy, rate-limiting approach, enumeration/timing defence, and email-template approach.
- Phase 1 → [data-model.md](./data-model.md): `User.passwordChangedAt`; `PasswordResetRequest` + `PasswordResetAuditEvent` (+ two enums); reference migration SQL.
- Phase 1 → [contracts/password-reset.md](./contracts/password-reset.md): the three endpoints with status codes and neutral-response discipline.
- Phase 1 → [quickstart.md](./quickstart.md): operator + developer walk-through with Mailpit, covering happy path, enumeration check, expiry, reuse, supersede, session invalidation, rate limiting.

## Post-Phase-1 Constitution Re-check

After Phase 1 design:

- I. Fixed Product Stack — **still PASS**. No new framework or dependency; reuses `004`'s Nodemailer client and `001`'s bcrypt.
- II. Layered Backend Architecture — **still PASS**. The module layout above confirms HTTP-only controllers, business-logic-only services, Prisma-only repositories, and the email provider behind the existing external client. The shared `setPassword` consolidates password mutation so reset and change-password cannot diverge.
- III. Strict TS + Async Code — **still PASS**. Zod-narrowed inputs; typed token/audit shapes; no `any`.
- IV. Isolated External and AI Services — **still PASS**. No provider details leak past `email.service`.
- V. REST + Config + Data Discipline — **still PASS**. Resource-oriented endpoints, centralised env, additive migration `0005_password_reset/`, `.env.example` updated.
- Implementation Standards — **still PASS**. Single-use is schema-enforced (`consumedAt`), supersede/invalidate are explicit state transitions, failed sends are retried and logged without crashing.
- Deviations (auth DB-read, in-process limiter, no durable queue, FE folder, MVP order) — acknowledged above; no new violations introduced by Phase 1.

No unresolved unknowns. The plan is ready for `/speckit-tasks`.
