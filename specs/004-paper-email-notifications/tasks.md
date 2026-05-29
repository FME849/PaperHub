---
description: "Implementation task list for feature 004-paper-email-notifications"
---

# Tasks: Email Notifications for Newly Fetched Papers

**Input**: Design documents from `/specs/004-paper-email-notifications/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Automated tests are NOT in scope for this feature, matching the `001`/`002`/`003` precedent. Verification is via the manual quickstart walk-through. If you want TDD-style task coverage, ask `/speckit-tasks` to regenerate with tests requested.

**Organization**: Tasks are grouped by user story (US1, US2, US3) so each story is independently completable and testable. The MVP is US1 alone (P1).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- All paths are repo-relative; the working directory at execution time is `/Users/fme849/Personal/Project/PaperHub`.

## Path Conventions

Web application — `backend/` and `Frontend/` at the repo root (per constitution deviation inherited from `001`). This feature is **backend-only**; no `Frontend/` files are touched.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the email-send dependency, declare new env vars, and wire the (still empty) notifications router so the rest of the work has a place to land.

- [ ] T001 Add `nodemailer` and `@types/nodemailer` dependencies in `backend/package.json` (run `npm install --save nodemailer && npm install --save-dev @types/nodemailer` from `backend/`); commit the updated `package.json` and `package-lock.json`.
- [ ] T002 [P] Add the new env vars to `backend/src/config/env.ts` per [plan.md § Technical Context → Constraints] and [research.md Decision 1, 6]: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `FRONTEND_BASE_URL`, `UNSUBSCRIBE_TOKEN_SECRET`, `DIGEST_TOP_PICKS_COUNT` (default 3), `HARD_BOUNCE_THRESHOLD` (default 3), `NOTIFICATIONS_ENABLED` (default true). Use the same `required` / `optional` / `optionalNumber` helpers; reject empty `UNSUBSCRIBE_TOKEN_SECRET` at startup when `NOTIFICATIONS_ENABLED=true`.
- [ ] T003 [P] Append the same env keys to `backend/.env.example` with placeholder values and a comment block pointing at [quickstart.md § 3] for the local Mailpit defaults and [quickstart.md § 11.5] for the Gmail SMTP overlay.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, the provider-agnostic external client, the typed payload shapes, and the empty router skeleton. Everything in Phase 3+ depends on this phase completing.

**⚠️ CRITICAL**: No user-story work can begin until Phase 2 is complete.

- [ ] T004 Update `backend/prisma/schema.prisma` to add the three new models and three new enums per [data-model.md § Entities]: `EmailNotificationPreference`, `PreferenceChangeSource` enum, `DigestSendRecord`, `DigestSendOutcome` enum, `EmailDeliveryFailure`, `EmailFailureClass` enum. Add the `notificationPreference`, `digestSendRecords`, `emailDeliveryFailures` back-relations on `User`. Verify with `npx prisma format`.
- [ ] T005 Generate the migration: from `backend/`, run `npx prisma migrate dev --name email_notifications` to produce `backend/prisma/migrations/0004_email_notifications/migration.sql`. Verify the SQL matches the reference in [data-model.md § Migration `0004_email_notifications` — SQL summary]; then run `npx prisma generate` to refresh the Prisma client types.
- [ ] T006 [P] Create `backend/src/external/email.client.ts` exposing a `EmailClient` interface with `send(payload: EmailSendPayload): Promise<EmailSendResult>` and a Nodemailer-backed implementation behind a small factory that reads `SMTP_*` and `EMAIL_*` from `env`. Define typed shapes for `EmailSendPayload` (`to`, `subject`, `html`, `text`, `from`) and `EmailSendResult` (`status: "ok" | "smtp_failure"`, `smtpResponseCode?`, `message?`). Translate Nodemailer errors into the typed result; do NOT throw raw SDK errors past this boundary. Per [research.md Decision 1] + [plan.md Principle IV].
- [ ] T007 [P] Create `backend/src/services/email-templates/digest.ts` with `renderDigestHtml(payload: DigestPayload): string` and `renderDigestText(payload: DigestPayload): string`. Define `DigestPayload` with `recipientUserId`, `cycleId`, `topPicks: Array<{paperId, title, authors[], summaryStatus, summaryBullets?, matchedTopicNames[], detailUrl}>`, `candidatePaperCount`, `seeMoreUrl`, `unsubscribeUrl`. Both renderers MUST consume the same typed input. Inline styles only, table-based layout, no remote images. Subject line is built by the caller, not by these renderers. Per [research.md Decision 5].
- [ ] T008 [P] Create `backend/src/repositories/emailNotificationPreference.repository.ts` exposing `getByUserId(userId)`, `upsert(userId, enabled, source: PreferenceChangeSource)`, `existsEnabled(userId): Promise<boolean>`. All Prisma access lives here; no other repository touches `EmailNotificationPreference`. Per [plan.md Principle II].
- [ ] T009 [P] Create `backend/src/repositories/digestSendRecord.repository.ts` exposing `tryClaim(userId, fetchCycleId): Promise<{ claimed: boolean; record: DigestSendRecord }>` (insert with `outcome=STARTED`, returning `claimed=false` when the unique constraint fires), `complete(id, patch: { outcome, completedAt, recipientEmail?, candidatePaperCount?, includedPaperIds?, failureReason? })`, `findByUserAndCycle(userId, fetchCycleId)`. Per [data-model.md § DigestSendRecord lifecycle] and [plan.md Constraints → Idempotency invariant].
- [ ] T010 [P] Create `backend/src/repositories/emailDeliveryFailure.repository.ts` exposing `record(input)` and `consecutiveHardBouncesSinceLastSent(recipientEmail: string): Promise<number>` (queries `EmailDeliveryFailure` rows for the address newer than the last `SENT` `DigestSendRecord` for any user who used that address; returns the count of contiguous `HARD_BOUNCE` rows at the head). Per [data-model.md § EmailDeliveryFailure] and FR-016.
- [ ] T011 [P] Extend `backend/src/repositories/topicPaperMatch.repository.ts` (existing) with `listNewAttributionsForUserInCycle(userId: number, cycleId: string): Promise<NewAttributionRow[]>`. The query joins `TopicPaperMatch → TrackedTopic` filtered by `userId` and the given `cycleId`, also joins `Paper` and (left) `PaperSummary`, returns rows ordered by `Paper.publishedAt DESC, TopicPaperMatch.fetchedAt DESC, Paper.id ASC` per [research.md Decision 4]. Each row carries `paperId, title, authors, publishedAt, fetchedAt, summaryStatus, summaryBullets, matchedTopics[{id,name}]`. Add only this one method; do not refactor existing methods.
- [ ] T012 [P] Create `backend/src/routes/notifications.routes.ts` exporting `notificationsRouter`. Mount the **unauthenticated** unsubscribe handler first (placeholder for now), then `authenticate` middleware, then the (placeholder) preference and cycles handlers. Wire the controller imports as TODOs to be filled by Phase 3+. Per [contracts/notifications.md § Cross-cutting].
- [ ] T013 Mount the new router in `backend/src/server.ts`: `app.use("/api/notifications", notificationsRouter);` after the existing `/api/papers` mount, before `errorHandler`. No other server.ts changes.

**Checkpoint**: Foundation ready — schema, router skeleton, external client, repositories, and the per-cycle attribution read model exist. User stories can now begin in parallel.

---

## Phase 3: User Story 1 - Per-fetch-cycle top-3 digest (Priority: P1) 🎯 MVP

**Goal**: When a `002` fetch cycle completes, every opted-in user with ≥ 1 newly attributed paper receives exactly one email digest highlighting up to 3 papers (title, authors, AI summary or placeholder, matching topic, PaperHub deep link), plus a "See more on PaperHub" link to that user's cycle-papers view. The send is async (cycle-tail), idempotent per `(user, cycle)`, and a failure for one user never affects the others or crashes the server.

**Independent Test**: per [spec.md § US1 Independent Test] — with `NOTIFICATIONS_ENABLED=true`, manually enable the preference for a test user (e.g., via `prisma studio` until US2 lands its endpoint), seed at least one tracked topic that will match in the next cycle, trigger a fetch cycle, and verify in Mailpit (or Gmail) that one email arrives with up to 3 papers, correct fields, the "See more" link, and that no email is sent when the cycle produced zero new attributions for the user.

### Implementation for User Story 1

- [ ] T014 [P] [US1] Create `backend/src/services/email.service.ts` exposing `sendDigest(args: { recipientEmail, recipientUserId, cycleId, payload: DigestPayload, subject: string }): Promise<EmailSendResult>`. The service composes via the templates from T007, then calls the `EmailClient` from T006. It does NOT decide eligibility or write `DigestSendRecord` — that's the orchestrator's job (T015). Subject line format per [contracts/notifications.md] and US1 AS1: `"PaperHub: ${count} new paper${count===1?'':'s'} in your topics"`.
- [ ] T015 [US1] Create `backend/src/services/notifications.service.ts` exporting `runForCycle(cycleId: string): Promise<{ sent: number; suppressedEmpty: number; suppressedPrefOff: number; suppressedBounce: number; failed: number; }>`. Algorithm:
  1. Read all `User`s with `EmailNotificationPreference.enabled = true`. (Lazy default: a user with no row is treated as `false`; do NOT create rows here.)
  2. For each such user:
     a. `digestSendRecord.tryClaim(userId, cycleId)` — if `claimed=false`, skip with a log line.
     b. `topicPaperMatch.listNewAttributionsForUserInCycle(userId, cycleId)` — if empty, `complete(SUPPRESSED_EMPTY)` and increment counter.
     c. Re-check the preference (it may have flipped after the claim) — if now `enabled=false`, `complete(SUPPRESSED_PREFERENCE_OFF)`.
     d. `emailDeliveryFailure.consecutiveHardBouncesSinceLastSent(user.email)` — if ≥ `HARD_BOUNCE_THRESHOLD`, `complete(SUPPRESSED_BOUNCE_QUARANTINE)`.
     e. Take the top `DIGEST_TOP_PICKS_COUNT` rows from (b) by the SQL ordering, build the `DigestPayload` (each `detailUrl = ${FRONTEND_BASE_URL}/papers/${paperId}`; `seeMoreUrl = ${FRONTEND_BASE_URL}/cycles/${cycleId}`; `unsubscribeUrl = ${request-host}/api/notifications/unsubscribe?token=${hmacFor(user.id)}` — see T016), then call `email.service.sendDigest`.
     f. On `status=ok` → `complete(SENT, recipientEmail=user.email, candidatePaperCount=rows.length, includedPaperIds=topPicks.map(p=>p.paperId))`.
     g. On `status=smtp_failure` → write an `EmailDeliveryFailure` row (HARD_BOUNCE if code ∈ {550, 551, 553, 554} else SOFT_BOUNCE / TIMEOUT / CONNECTION_ERROR / OTHER), then `complete(FAILED_PERMANENT|FAILED_RETRYABLE, failureReason=…)`.
  3. **Every per-user iteration MUST be wrapped in `try/catch`**: catch swallows the error, logs `{ userId, cycleId, errorClass, message }`, increments `failed`, and continues with the next user. Per FR-014 / SC-007.
  4. Return the counter struct. Caller (T018) logs it.
- [ ] T016 [P] [US1] In `backend/src/services/notifications.service.ts` (same file as T015, or a small helper module if cleaner), add `buildUnsubscribeToken(userId: number): string` and `verifyUnsubscribeToken(token: string): number | null`. Use `crypto.createHmac("sha256", env.UNSUBSCRIBE_TOKEN_SECRET).update(String(userId)).digest("base64url")` with the `v1:` prefix; verify by recomputing MACs across all candidate users is NOT acceptable — encode `userId` in the token itself as `v1:${base64url(userId)}.${mac}` so verification is `O(1)` (`split('.')`, decode `userId`, recompute MAC, `crypto.timingSafeEqual`). Per [research.md Decision 6]. The function is used by both T015 (compose) and T021 (verify).
- [ ] T017 [P] [US1] Add a small helper `topPicksRanking` and a Zod schema `DigestPayloadSchema` near T015 / T007 that validate the typed shapes at the service boundary. No `any`; reject malformed rows from T011 with a logged warning.
- [ ] T018 [US1] Modify `backend/src/services/fetchCycle.service.ts` (existing): at the very end of `run()`, after the existing summarisation phase and the `finalize` write that sets `FetchCycle.status = SUCCEEDED | PARTIAL`, add a `try { if (env.NOTIFICATIONS_ENABLED) await notificationsService.runForCycle(cycleId); } catch (err) { console.error("[notifications] runForCycle crashed:", err); }`. The outer `try/catch` is belt-and-braces — the per-user catch inside T015 is the actual guarantee. Per [plan.md Constraints → Server stability] + FR-014. The cron job (`backend/src/jobs/fetchCycle.job.ts`) is NOT touched.

**Checkpoint**: US1 fully functional end-to-end. Toggle the preference for a test user via `prisma studio` (US2 endpoints not yet shipped), run a fetch cycle, see exactly one email per opted-in user with non-empty candidate set. SC-001 / SC-002 / SC-003 / SC-005 / SC-007 are demonstrable; FR-001 / FR-002 / FR-003 / FR-004 / FR-005 / FR-006 / FR-007 / FR-008 / FR-011 / FR-013 / FR-014 / FR-015 / FR-016 / FR-017 are implemented.

---

## Phase 4: User Story 2 - Enable / disable notification preference (Priority: P2)

**Goal**: Authenticated users can read and write their notification preference via REST. Default is off; the new state takes effect from the next fetch cycle; never retroactive. Replaces the `prisma studio` hack from the US1 checkpoint with the real settings surface.

**Independent Test**: per [spec.md § US2 Independent Test] — log in as a user with a tracked topic, `GET /api/notifications/preference` returns `{enabled:false,…}`, `PUT {enabled:true}` succeeds, the next fetch cycle delivers a digest; `PUT {enabled:false}` and the next cycle delivers nothing. Preference persists across logout/login. Unauthenticated requests to the preference endpoints are rejected.

### Implementation for User Story 2

- [ ] T019 [P] [US2] Create `backend/src/controllers/notifications.controller.ts` with `getPreference(req, res)` and `putPreference(req, res)` handlers. Both require `req.userId` from the existing `authenticate` middleware. `getPreference` calls `emailNotificationPreference.getByUserId(req.userId)` and returns the contract shape from [contracts/notifications.md § GET]; missing row → return the default shape (`enabled: false`, `lastChangedAt: null`, `lastChangedVia: null`) without writing. `putPreference` parses the body with a Zod schema `z.object({ enabled: z.boolean() }).strict()`, then calls `emailNotificationPreference.upsert(req.userId, body.enabled, "SETTINGS_UI")` and returns the new state. Validation errors throw a `DomainError(400, …)` so `errorHandler` formats them.
- [ ] T020 [US2] Wire the two handlers into `backend/src/routes/notifications.routes.ts` from T012: `router.get("/preference", authenticate, getPreference)` and `router.put("/preference", authenticate, putPreference)`. Confirm the unsubscribe handler is mounted **before** `authenticate`. Manually verify with `curl` against `http://localhost:4000/api/notifications/preference` per [quickstart.md § 5].

**Checkpoint**: US2 fully functional. Combined with US1, the feature is shippable to opted-in users. FR-009 / FR-010 / FR-017 (preference half) are demonstrable.

---

## Phase 5: User Story 3 - Email content quality + one-click unsubscribe (Priority: P3)

**Goal**: The footer-level one-click unsubscribe link works end-to-end (no login required, idempotent, flips the same preference as US2), and the digest email's polish-level acceptance criteria from [spec.md § US3] are verifiable.

Most of the email-content scenarios (subject, HTML + plain text, deep links, footer wording) are already produced by T007 in Phase 2 and consumed by T015 in US1. This phase delivers the unsubscribe HTTP surface and adds the "See more" backing endpoint so the "See more" link in US1's email actually resolves to a working page.

**Independent Test**: per [spec.md § US3 Independent Test] — receive a US1 digest, click the footer unsubscribe link in a fresh browser session (no PaperHub login), see the no-login confirmation page; the next fetch cycle delivers no email; `GET /api/notifications/preference` (logged in) shows `enabled=false, lastChangedVia=UNSUBSCRIBE_LINK`; re-clicking the link still returns the same `200` page (idempotent). Inspect the email in two mail clients and verify subject count, HTML + plain text parity, working deep links, footer wording.

### Implementation for User Story 3

- [ ] T021 [P] [US3] Add `getUnsubscribe(req, res)` to `backend/src/controllers/notifications.controller.ts`. Parse `req.query.token` with `z.string().min(1)`; pass it to `verifyUnsubscribeToken` from T016. On invalid token → return `400` with the generic "invalid/expired" HTML from [contracts/notifications.md § GET /api/notifications/unsubscribe — 400]. On valid token → `emailNotificationPreference.upsert(userId, false, "UNSUBSCRIBE_LINK")`, then return the no-login confirmation HTML. **Never** set a cookie; **never** redirect to an authenticated page. The handler MUST set `Content-Type: text/html; charset=utf-8`. The request logger MUST NOT log the full token — extend the logger or pre-redact in this handler.
- [ ] T022 [US3] Wire the unsubscribe handler into `backend/src/routes/notifications.routes.ts`: `router.get("/unsubscribe", getUnsubscribe)` mounted **before** the `authenticate` middleware (the router from T012 already reserves this slot). Confirm with `curl -v` that no `Set-Cookie` header appears in the response.
- [ ] T023 [P] [US3] Create `backend/src/controllers/cycles.controller.ts` exporting `getCyclePapers(req, res)` per [contracts/cycles.md]. Parses `:cycleId` (cuid shape) and query params `limit` (1–200, default 50) and `cursor` with Zod. Calls a new service method `notificationsService.listCyclePapersForUser(req.userId, cycleId, { limit, cursor })` (add to T015's file) which reuses `topicPaperMatch.repository.listNewAttributionsForUserInCycle` and applies cursor pagination over `(publishedAt DESC, fetchedAt DESC, paperId ASC)`. Returns the contract shape from [contracts/cycles.md § 200 OK]; empty result OR unknown cycle → identical `404 NOT_FOUND` body (no information disclosure across users).
- [ ] T024 [US3] Wire `getCyclePapers` into `backend/src/routes/notifications.routes.ts`: `router.get("/cycles/:cycleId/papers", authenticate, getCyclePapers)`. Verify the route precedence (`/cycles/...` doesn't collide with `/unsubscribe` or `/preference`).
- [ ] T025 [US3] In `backend/src/services/email-templates/digest.ts` (from T007), verify the rendered HTML + plain text match every line in [spec.md § US3 Acceptance Scenarios] and the email body invariants in [plan.md § Constitution Check Principle V]: subject with paper count (built by T015's caller — make sure that string lines up with the spec wording), HTML body and plain-text alternative carrying identical content, footer with PaperHub-branded "from" (`EMAIL_FROM_NAME`), unsubscribe link from T021 / T022, and the one-line "you are receiving this because…" reason. If T007 was implemented minimally for US1, expand it here.

**Checkpoint**: All three user stories functional. FR-012 (unsubscribe), FR-005 ("See more" target), and US3's email-quality acceptance scenarios are demonstrable. SC-006 / SC-008 / SC-009 are verifiable via the quickstart inspection.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Wrap-up tasks that touch the whole feature.

- [ ] T026 [P] Run `npm run lint` (i.e., `tsc --noEmit`) from `backend/`; resolve any errors. No `any`, no `unknown` outside narrowed boundaries (Zod input parsing in controllers; Nodemailer error narrowing in `external/email.client.ts`).
- [ ] T027 [P] Run the full [quickstart.md] walk-through end-to-end with Mailpit. Tick every verification bullet (US1 happy path, no-duplicate guarantee in § 8, empty cycle in § 9, unsubscribe in § 10, bounce path in § 11). Note any deltas in [quickstart.md] and fix.
- [ ] T028 [P] Verify the Gmail SMTP overlay in [quickstart.md § 11.5] by swapping the `SMTP_*` block to a Google account with an App Password and triggering one cycle. Confirm the email lands in a real Gmail inbox and that `From` matches `SMTP_USER`. Document any provider-side surprises (Promotions tab, "via gmail.com" decoration) in a brief comment in [quickstart.md].
- [ ] T029 Update `CLAUDE.md` if any new operational caveat surfaced during T026–T028. (The plan reference is already updated to `004-paper-email-notifications/plan.md`; only revise if the implementation diverged from the plan.)

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup. **BLOCKS all user stories.** T004 → T005 are sequential (schema before migration). T006–T012 are all `[P]` and can run together once T004/T005 finish. T013 depends on T012.
- **User Story 1 (Phase 3, MVP)**: Depends on Foundational. T014, T016, T017 are `[P]` siblings of T015 (the orchestrator); T015 depends on T009/T010/T011/T007/T006 from Phase 2; T018 depends on T015.
- **User Story 2 (Phase 4)**: Depends on Foundational only — does **not** depend on US1 (it can be implemented in parallel by a second developer; the preference repository from T008 is the only shared touchpoint, already in Phase 2). T019 → T020 are sequential.
- **User Story 3 (Phase 5)**: Depends on Foundational. The unsubscribe HMAC helpers (T016) come from US1; if US3 is being implemented before US1, hoist T016 into Phase 2 instead. T021 → T022 are sequential; T023 → T024 are sequential; T021/T022 and T023/T024 are `[P]` between the two pairs; T025 is `[P]` with the others.
- **Polish (Phase 6)**: Depends on all desired user stories being complete.

### User-story dependencies

- **US1 (P1)** is the MVP. Ship after Phase 3.
- **US2 (P2)** is independent of US1 in code but only useful in tandem with US1 (a preference toggle that controls nothing is not demoable). Ship after Phase 4.
- **US3 (P2)** depends on US1 for the digest itself (the unsubscribe link only exists in a delivered digest). If US1 is unshipped, US3's unsubscribe endpoint can still be tested by hand-constructing a token via T016, but the user-visible value is contingent on US1.

### Within each user story

- Models / schema before services.
- Services before controllers.
- Controllers before routes.
- Wiring (`server.ts` / route mount) last.

### Parallel opportunities

- **Setup**: T002 and T003 in parallel after T001.
- **Foundational**: T006, T007, T008, T009, T010, T011, T012 all in parallel after T005.
- **US1**: T014, T016, T017 in parallel; T015 starts after them; T018 last.
- **US2**: only T019 / T020 — sequential. Run US2 in parallel with US1 across developers if staffing allows.
- **US3**: T021/T022 (unsubscribe pair), T023/T024 (cycles pair), and T025 (template polish) — three parallel tracks, then a single wiring step at the end.
- **Polish**: T026, T027, T028 in parallel; T029 last.

---

## Parallel Example: User Story 1 implementation

```bash
# After Phase 2 completes, kick off US1's parallel siblings simultaneously:
Task: "Create backend/src/services/email.service.ts (T014)"
Task: "Add HMAC unsubscribe token helpers to notifications.service.ts (T016)"
Task: "Add Zod payload schemas for digest input (T017)"

# Then T015 (notifications.service.ts orchestrator) — depends on the above plus T007/T008/T009/T010/T011 from Phase 2.

# Finally T018 — single-line tail call in fetchCycle.service.ts.
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Complete Phase 1: Setup (T001–T003).
2. Complete Phase 2: Foundational (T004–T013). **Do not skip the migration step — every subsequent task depends on the Prisma client types from `prisma generate`.**
3. Complete Phase 3: User Story 1 (T014–T018).
4. **STOP and VALIDATE**: run [quickstart.md § 6–8] with Mailpit. Confirm one email per opted-in user per cycle, no email on empty cycles, no duplicates on retried cycles, server stays up on a forced send failure.
5. (Optional) demo via Gmail SMTP overlay per [quickstart.md § 11.5].

### Incremental delivery

1. Phase 1 + Phase 2 → foundation ready.
2. Phase 3 → MVP. Demo.
3. Phase 4 → settings UI surface; ship the preference endpoints. Demo.
4. Phase 5 → footer unsubscribe + "See more" target. Demo.
5. Phase 6 → polish.

### Parallel team strategy

With two backend developers:

1. Both complete Phases 1 + 2 together (schema and external client are best paired-reviewed).
2. After Phase 2: Developer A takes US1 (T014–T018); Developer B takes US2 (T019–T020) then US3 (T021–T025).
3. Polish (Phase 6) together.

---

## Notes

- This feature is backend-only this iteration. The FE teammate will deliver the preference toggle UI (consumes US2 endpoints), the unsubscribe landing-page polish (consumes US3's `GET /api/notifications/unsubscribe`), and the cycle-papers page (consumes US3's `GET /api/notifications/cycles/:cycleId/papers`).
- Local development should use Mailpit per [quickstart.md § 3]. Switch to Gmail SMTP only for the demo per [quickstart.md § 11.5].
- The notification job runs at the tail of `fetchCycle.service.run()` — there is no second cron. If `NOTIFICATIONS_ENABLED=false` (the master kill-switch), `fetchCycle.service.run()` skips the call entirely; no `DigestSendRecord` rows are created.
- Idempotency is schema-enforced via `DigestSendRecord.@@unique([userId, fetchCycleId])`. A retried cycle produces zero new digests; a re-run that finds a `STARTED`-state row from a previous crash also produces zero new digests (intentional — we accept "one missed digest after a crash" over a risk of double-send; per [research.md Decision 2]).
- Commit after each task or logical group. Stop at any checkpoint to validate the story independently.
