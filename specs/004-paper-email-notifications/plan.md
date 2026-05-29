# Implementation Plan: Email Notifications for Newly Fetched Papers

**Branch**: `004-paper-email-notifications` | **Date**: 2026-05-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-paper-email-notifications/spec.md`

## Summary

Deliver a backend slice that, on each completed `002` fetch cycle, sends each opted-in user a Reddit-style "top 3" digest email of papers newly attributed to their tracked topics in that cycle, with each entry carrying the title, ordered authors, the AI bullet summary from `003-paper-summary-search`'s `PaperSummary`, the matching topic(s), and a deep link into PaperHub. A "See more on PaperHub" link points to a new per-cycle "what's new for me" view scoped to that user × that cycle. Users opt in via a new account-settings preference (defaulting to off) and can unsubscribe in one click from the email footer with no login required.

Three user stories, summarised:

- **US1 (P1)** — Per-fetch-cycle digest with up to 3 top-picked papers, AI summaries, deep links, and a "See more" link. Idempotent: a paper-topic attribution appears in at most one digest per user across the lifetime of that user's notifications.
- **US2 (P2)** — Account-settings preference (`GET` / `PUT /api/notifications/preference`). Default off. Effective from the next cycle; never retroactive.
- **US3 (P2)** — Email content quality, one-click footer unsubscribe (no-login `GET /api/notifications/unsubscribe?token=…`) that flips the same preference as US2.

Cadence is the existing `002` fetch cycle — this feature does **not** introduce a separate scheduler or cron. The notification job is invoked from `services/fetchCycle.service.ts` after per-paper persistence + summarisation, so it sees the same `cycleId` that `TopicPaperMatch.cycleId` already records, and so async isolation from the HTTP request path is inherited for free. Failed sends are caught per recipient, logged, and never crash the cycle (FR-014, SC-007).

Frontend integration is **deferred** for this iteration — per the project's working agreement, the FE reorg is owned separately by another teammate. This plan ships only the backend service, schema, REST contracts, transactional email-send path, and operator quickstart. The contracts here are the FE handoff for the preference toggle, the cycle-papers "what's new" page that backs the "See more" link, and the unsubscribe confirmation page.

## Technical Context

**Language/Version**: TypeScript 5.6 strict on both frontend and backend; Node.js 20+ for the backend runtime (inherited from `001` / `002` / `003`).

**Primary Dependencies** (additions beyond what `001` + `002` + `003` already installed):

- `nodemailer` (^6.x) — provider-neutral SMTP client. Per Constitution Principle IV, the email provider stays isolated behind `external/email.client.ts`; operators configure the actual provider (Mailgun, Postmark, SendGrid, SES, Gmail, etc.) entirely via `SMTP_*` env vars without touching code. Rationale and rejected alternatives are recorded in [research.md](./research.md) Decision 1.
- (No new dependency for templating — the v1 email HTML and plain-text bodies are produced by a small handwritten renderer in `services/email-templates/digest.ts` using template literals and the existing Zod-validated input shape. A framework like `mjml` or `react-email` is rejected for v1 — see [research.md](./research.md) Decision 5.)
- Existing from `001` + `002` + `003`: `express`, `@prisma/client`, `prisma`, `jsonwebtoken`, `zod`, `cors`, `dotenv`, `tsx`, `bcryptjs`, `node-cron`, `fast-xml-parser`, `@google/generative-ai`.

**Storage**: MySQL 8.x via Prisma, same container as `001` + `002` + `003`. Three new tables: `EmailNotificationPreference`, `DigestSendRecord`, `EmailDeliveryFailure`. No changes to `User`, `Favorite`, `TrackedTopic`, `Paper`, `PaperSummary`, `TopicPaperMatch`, `FetchCycle` (the existing `TopicPaperMatch.cycleId` is the join key for "this cycle's new attributions for this user", so no schema change is needed there). New migration: `0004_email_notifications` (additive only). See [data-model.md](./data-model.md).

**Testing**: Manual quickstart walkthrough (`quickstart.md`), matching `001` / `002` / `003` precedent. Automated tests remain out of scope until a follow-up hardening pass. The quickstart relies on a local SMTP catcher (MailHog / Mailpit) so a developer can verify rendering, links, and unsubscribe without sending real mail.

**Target Platform**: same as `002` / `003` — Express REST API on port 4000, MySQL 8.x via connection string. Local development on macOS/Linux; production deployment is out of scope.

**Project Type**: Web application (backend-only this iteration; frontend deferred).

**Performance Goals**: Per the `001` / `002` / `003` precedent ("skip perf for now"), no perf benchmarking required. SC-001's 15-minute end-to-end SLA is easily met by an in-process synchronous send loop over hundreds of users; SC-007's "one bad send must not stop the batch" is a correctness property (`try/catch` per recipient), not a perf property.

**Constraints**:

- **No new scheduler**: cadence MUST be `002`'s fetch-cycle cadence; this feature does NOT add a second cron. The notification job is the final step of `fetchCycle.service.ts`'s `run()` (after summarisation), running in the same async context.
- **Privacy invariant** (FR-008, FR-017): every digest body and every deep link in the digest is composed strictly from data belonging to the recipient. The "new attributions in this cycle" query MUST filter by `TrackedTopic.userId = recipient.userId`; the unsubscribe token MUST resolve to the recipient and nobody else.
- **Idempotency invariant** (FR-006, FR-007, FR-011, FR-015): `DigestSendRecord` has `@@unique([userId, fetchCycleId])`; the notification job upserts a row in `STARTED` state before composing, and transitions to `SENT` / `SUPPRESSED_*` / `FAILED_*` after the send attempt. A retried cycle that finds an existing record for `(user, cycle)` in a terminal state MUST skip sending; an existing record in `STARTED` state is re-driven (no double-send because the row is already there as the lock).
- **Server stability** (FR-014, SC-007): every per-recipient send is wrapped in `try/catch`; one failure logs context (`userId`, `cycleId`, error class, timestamp) and continues with the next recipient. The notification job's outer try/catch ensures a job crash never propagates to `cron.schedule`'s callback — the existing scheduler shell already has its own catch, so this is belt-and-braces.
- **Hard-bounce tracking simplification for v1**: synchronous SMTP rejections (e.g. `550 No such user`) are recorded in `EmailDeliveryFailure` with `failureClass = HARD_BOUNCE`; truly *asynchronous* bounces (delivered to a bounce mailbox hours later) are deferred to a v2 webhook/IMAP-poll path. Documented as a deviation in **Complexity Tracking**. SC-005 (suppression within one cycle of crossing the threshold) is still satisfied for the synchronous case.
- **Email content size**: each digest is capped at 3 top picks (FR-003) plus footer; total payload stays well under any provider's per-message size limit; no streaming or attachments.
- **Reusing `003`'s summary** (FR-004): the digest reads `PaperSummary` by `paperId`; if `PaperSummary` is missing OR `status != SUCCEEDED`, the entry shows a "summary not yet available" placeholder rather than failing or delaying the send.

**Scale/Scope**: Pre-MVP local development. Expected initial: < 100 users, up to ~20 tracked topics per user, ~50–200 papers per user catalog, fetch cycle cadence default `0 3 * * *` (once daily, configurable via `FETCH_CRON_EXPR`). Worst-case per-cycle digest fan-out: ~100 emails, each composed in O(1) DB queries plus one SMTP send. Fits comfortably inside a single Node process; no queue/worker needed in v1.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Fixed Product Stack | PASS | Next.js + TS frontend (no FE changes this iteration), Express + TS backend (extending `001` + `002` + `003`), REST, MySQL + Prisma. Email integration is isolated (Principle IV). |
| II. Layered Backend Architecture | PASS | Controllers (HTTP only): `notifications.controller` (preference get/put + unsubscribe), `cycles.controller` (the "See more" backing endpoint). Services: `notifications.service` (orchestrates the per-cycle fan-out), `email.service` (provider-agnostic compose/send wrapper), `digestPicker.service` (top-3 selection — small enough to fold into `notifications.service` and noted as such below). Repositories: `emailNotificationPreference.repository`, `digestSendRecord.repository`, `emailDeliveryFailure.repository`, plus a new method on `topicPaperMatch.repository` to fetch "new attributions in cycle X for user Y". External client: `external/email.client.ts` (Nodemailer-backed; provider-agnostic API). The cron job (`jobs/fetchCycle.job.ts`) gains zero business logic; the notification step is invoked from `services/fetchCycle.service.ts` as the tail of `run()`. |
| III. Strict TS + Async Code | PASS | `tsconfig` strict mode (inherited), `async/await` throughout, no `any`. `unknown` only at HTTP request bodies (Zod-narrowed) and Nodemailer error bodies (narrowed to typed `EmailSendError`). |
| IV. Isolated External and AI Services | PASS | Email-provider access lives in `external/email.client.ts` (Nodemailer SDK + a tiny typed interface `EmailClient { send(payload): Promise<SendResult> }`). The service layer (`email.service.ts`) sees only that interface, never `nodemailer.Transporter` directly. Provider swap (e.g. Postmark, Resend, SES) stays inside `external/` plus env vars, with no provider-specific types leaking into controllers, services other than `email.service`, or repositories. AI usage is unchanged from `003`: the digest reads pre-existing `PaperSummary` rows; no new AI call path. Failures are caught at the service boundary and translated to typed errors; raw SMTP/SDK errors never reach the user. |
| V. REST + Config + Data Discipline | PASS | New resource-oriented endpoints: `GET /api/notifications/preference`, `PUT /api/notifications/preference`, `GET /api/notifications/unsubscribe?token=…`, `GET /api/notifications/cycles/:cycleId/papers`. Meaningful status codes documented per endpoint in [contracts/](./contracts/). Server-side Zod validation. New env vars centralised in `backend/src/config/env.ts` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `FRONTEND_BASE_URL`, `UNSUBSCRIBE_TOKEN_SECRET`, `DIGEST_TOP_PICKS_COUNT`, `HARD_BOUNCE_THRESHOLD`, `NOTIFICATIONS_ENABLED`). `.env.example` is updated. Migration `0004_email_notifications/`. |
| Repository Folder Rules | DEVIATION (inherited from `001`) | Next.js app remains at repo root (`/Frontend`) rather than `/frontend`. This feature ships backend only, so the deviation has no functional impact on what is delivered here. See **Complexity Tracking**. |
| Implementation Standards | PASS | Controllers parse, services orchestrate, repositories own Prisma. The notification step is idempotent — running the same cycle twice (e.g., operational re-run) produces zero new digests for `(user, cycle)` pairs already in a terminal `DigestSendRecord` state (FR-006, FR-015, schema-enforced via `DigestSendRecord.@@unique([userId, fetchCycleId])`). Failed sends do not crash the server (FR-014, server-side try/catch + middleware). |
| MVP Delivery Order | DEVIATION | The constitution's MVP feature list ends at `#9 favorites` and does not include email notifications. Email notifications are an explicit user-requested **post-MVP** slice that unlocks off-platform engagement once the in-app catalog (`001`–`003`) is shippable. Mirrors `003`'s precedent of bundling user-requested slices adjacent to the named MVP list. See **Complexity Tracking**. |
| Default AI Provider Selection (Implementation Standards) | PASS | No new AI provider use. The digest re-reads `PaperSummary` rows produced by `003`'s existing Gemini-backed summariser; no new prompts, no new calls. |

Both deviations are documented in **Complexity Tracking** below with the simpler alternative considered. **Post-Phase-1 re-check** at the bottom of this plan confirms no new violations.

## Project Structure

### Documentation (this feature)

```text
specs/004-paper-email-notifications/
├── plan.md                       # This file
├── spec.md                       # Feature specification (resolved, no NEEDS CLARIFICATION)
├── research.md                   # Phase 0 output
├── data-model.md                 # Phase 1 output
├── quickstart.md                 # Phase 1 output
├── contracts/                    # Phase 1 output
│   ├── notifications.md          # GET/PUT /api/notifications/preference, GET /api/notifications/unsubscribe
│   └── cycles.md                 # GET /api/notifications/cycles/:cycleId/papers ("See more" target)
└── checklists/
    └── requirements.md           # Spec quality checklist (from /speckit-specify)
```

> Note: `contracts/notifications.md` documents both the preference endpoints and the unsubscribe endpoint together since they share the same resource (`EmailNotificationPreference`). The cycle-papers endpoint lives in a separate `contracts/cycles.md` because it is a fundamentally different resource (catalog read), even though only the digest's "See more" link references it from this feature.

### Source Code (repository root)

```text
backend/                                            # EXTENDED from 001 + 002 + 003
├── package.json                                    # MODIFIED: add `nodemailer` + `@types/nodemailer` (dev)
├── .env.example                                    # MODIFIED: add SMTP_*, EMAIL_*, FRONTEND_BASE_URL,
│                                                   #           UNSUBSCRIBE_TOKEN_SECRET, DIGEST_*, NOTIFICATIONS_*
├── prisma/
│   ├── schema.prisma                               # MODIFIED: add EmailNotificationPreference,
│   │                                               #           DigestSendRecord, DigestSendOutcome enum,
│   │                                               #           EmailDeliveryFailure, EmailFailureClass enum
│   └── migrations/
│       └── 0004_email_notifications/
│           └── migration.sql                       # NEW
└── src/
    ├── server.ts                                   # MODIFIED: mount /api/notifications router
    ├── config/
    │   └── env.ts                                  # MODIFIED: SMTP_*, EMAIL_*, FRONTEND_BASE_URL,
    │                                               #           UNSUBSCRIBE_TOKEN_SECRET, DIGEST_TOP_PICKS_COUNT,
    │                                               #           HARD_BOUNCE_THRESHOLD, NOTIFICATIONS_ENABLED
    ├── controllers/
    │   ├── notifications.controller.ts             # NEW: preference get/put + unsubscribe handler
    │   └── cycles.controller.ts                    # NEW: GET /api/notifications/cycles/:cycleId/papers
    ├── services/
    │   ├── notifications.service.ts                # NEW: orchestrate per-cycle fan-out, idempotency,
    │   │                                           #      top-3 selection, preference flip, unsub token
    │   ├── email.service.ts                        # NEW: provider-agnostic compose+send;
    │   │                                           #      depends on external/email.client.ts only
    │   ├── email-templates/
    │   │   └── digest.ts                           # NEW: handwritten HTML + plain-text rendering
    │   └── fetchCycle.service.ts                   # MODIFIED from 002: tail-call notificationsService.runForCycle(cycleId)
    ├── repositories/
    │   ├── emailNotificationPreference.repository.ts  # NEW
    │   ├── digestSendRecord.repository.ts          # NEW
    │   ├── emailDeliveryFailure.repository.ts      # NEW
    │   └── topicPaperMatch.repository.ts           # MODIFIED from 002: add listNewAttributionsForUserInCycle
    ├── external/
    │   └── email.client.ts                         # NEW: Nodemailer-backed; small typed interface
    ├── routes/
    │   └── notifications.routes.ts                 # NEW: mounts notifications + cycles controllers
    └── jobs/
        └── fetchCycle.job.ts                       # UNCHANGED — no new scheduler; notification step
                                                    #             lives inside fetchCycle.service.run() tail
Frontend/                                           # UNCHANGED in this iteration
                                                    # FE work for preference toggle, unsubscribe landing page,
                                                    # and "See more" cycle-papers page is the FE teammate's slice.
specs/004-paper-email-notifications/                # (this feature's documentation, see above)
```

**Structure Decision**: Single-feature backend extension on the established `001` + `002` + `003` layout. No new top-level folders. Three new files in `controllers/`, four new files in `services/` (counting the `email-templates/` subfolder as one location), three new repositories, one new external client, one new router, one new Prisma migration. One existing service (`fetchCycle.service.ts`) gets a tail call; one existing repository (`topicPaperMatch.repository.ts`) gets one new method. No frontend code is touched in this iteration; the FE teammate consumes the contracts in `contracts/`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Frontend lives at repo root `/Frontend` rather than constitutional `/frontend` | Inherited from `001` and not relitigated in `002` / `003`. This feature ships no frontend changes, so re-aligning the folder casing here would expand the diff scope without product value. | Renaming `/Frontend` → `/frontend` is a repo-wide rename touching every FE PR and the FE teammate's in-flight reorg. Out of scope for this backend-only iteration. |
| Email notifications are not on the constitution's enumerated MVP list (1–9) | The user-supplied requirement is explicit and the prerequisites (`001` account + email, `002` fetch cycle + `cycleId`, `003` AI summary) are all already shipped. Holding this feature until *every* MVP item is complete would block off-platform engagement work for no incremental clarity gain. | A strict "no advanced feature until all 9 MVP items ship" reading would defer this feature indefinitely. Constitution allows explicit user approval for deviation; the user's `/speckit-specify` invocation is that approval signal. Mirrors `003`'s precedent (recommendations were similarly outside the named MVP list). |
| Synchronous-only bounce tracking in v1 (asynchronous bounces / complaints not handled) | SMTP doesn't synchronously report all hard bounces — many arrive minutes/hours later to a bounce mailbox or via provider webhook. A full async-bounce path (IMAP polling or provider webhook + signature verification) is a non-trivial sub-feature in its own right (HTTP endpoint, secret management, provider-specific payloads). | Implementing full async bounce handling in v1 would double the size of this feature for a behaviour that's primarily a deliverability optimisation. FR-016 + SC-005 (bounce quarantine within one cycle of crossing the threshold) is satisfied for synchronous SMTP rejections; truly async bounces become a v2 follow-up with the webhook/IMAP path. Documented in [research.md](./research.md) Decision 3. |

## Phase 0 (Research) and Phase 1 (Design) — outputs

- Phase 0 → [research.md](./research.md): six decisions covering email-provider choice, scheduler-vs-cron-tail, async-bounce simplification, top-3 ranking, template approach, and unsubscribe token shape.
- Phase 1 → [data-model.md](./data-model.md): three new tables (`EmailNotificationPreference`, `DigestSendRecord`, `EmailDeliveryFailure`) + two new enums (`DigestSendOutcome`, `EmailFailureClass`) + one new method on `TopicPaperMatch` read model.
- Phase 1 → [contracts/notifications.md](./contracts/notifications.md): preference get/put + unsubscribe (no-login).
- Phase 1 → [contracts/cycles.md](./contracts/cycles.md): cycle-papers "See more" target.
- Phase 1 → [quickstart.md](./quickstart.md): operator + developer walk-through with MailHog/Mailpit.

## Post-Phase-1 Constitution Re-check

After completing Phase 1 design (data model + contracts + quickstart), the Constitution Check above is re-evaluated:

- I. Fixed Product Stack — **still PASS**. No new framework or language; Nodemailer is the only new runtime dependency and it stays inside `external/`.
- II. Layered Backend Architecture — **still PASS**. The detailed module layout in **Source Code** above confirms HTTP-only controllers, business-logic-only services, Prisma-only repositories, and SMTP-only external client. `digestPicker` did NOT become its own service — top-3 selection is small enough to live as a private helper in `notifications.service.ts`; this simplification is captured in the file tree above (no `digestPicker.service.ts` entry).
- III. Strict TS + Async Code — **still PASS**. Phase 1 contracts use Zod input shapes and typed output shapes throughout; no `any`.
- IV. Isolated External and AI Services — **still PASS**. `external/email.client.ts` is the sole boundary; `services/email.service.ts` depends on it via a typed interface. AI usage is unchanged (digest reads `PaperSummary` produced in `003`).
- V. REST + Config + Data Discipline — **still PASS**. Resource-oriented endpoints documented in `contracts/`; new env vars centralised; migration `0004_email_notifications/` added; `.env.example` updated.
- Implementation Standards — **still PASS**. Idempotency is schema-enforced (`DigestSendRecord.@@unique([userId, fetchCycleId])`); failed sends are caught and logged (`emailDeliveryFailure.repository`); the cron job remains a thin shell.
- MVP order — deviation still acknowledged; no new violations.

No new violations introduced by Phase 1 design. The plan is ready for `/speckit-tasks`.
