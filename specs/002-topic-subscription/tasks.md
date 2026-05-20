# Tasks: Tracked Research Topics with Periodic Paper Fetch

**Input**: Design documents from `/specs/002-topic-subscription/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/topics.md, contracts/topic-papers.md, contracts/sources.md, quickstart.md

**Tests**: Automated tests are explicitly **out of scope** for this iteration (Decision 14 — manual quickstart only, matching 001's precedent). No `tests/` tasks are generated; verification is via `quickstart.md`.

**Organization**: Tasks are grouped by user story. Phase 3 (US1, P1) is the MVP; Phases 4–6 deliver US2/US3/US4 incrementally. Frontend integration is **deferred** (Decision 15) — no FE tasks here.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different files, no dependencies on other incomplete tasks — safe to parallelize.
- **[Story]**: Maps the task to a user story (US1, US2, US3, US4). Setup / Foundational / Polish phases have no story label.
- Every task carries an exact file path.

## Path Conventions

Backend root: `backend/` at the repo root (extending the service from 001-user-auth). Prisma at `backend/prisma/`. Source at `backend/src/`. No frontend changes this iteration.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new dependencies and document the new operator-facing environment variables.

- [ ] T001 Add `node-cron` and `fast-xml-parser` as runtime dependencies and `@types/node-cron` as a dev dependency in `backend/package.json`; run `npm install` from `backend/` to refresh `backend/package-lock.json`.
- [ ] T002 [P] Add the new operator env vars (`FETCH_CRON_EXPR`, `ARXIV_BASE_URL`, `ARXIV_MIN_REQUEST_INTERVAL_MS`, `ARXIV_MAX_RETRIES`, `MAX_TOPICS_PER_USER`, `MAX_KEYWORDS_PER_TOPIC`, `MAX_FILTERS_PER_TOPIC`, `MAX_KEYWORD_LENGTH`, `MAX_TOPIC_NAME_LENGTH`, `MAX_NEW_PAPERS_PER_TOPIC_PER_CYCLE`, `INITIAL_FETCH_WINDOW_HOURS`) with the defaults from `research.md` Decisions 4 and 7 to `backend/.env.example`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, config, validation, and error types that every user story below depends on.

**CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T003 Extend `backend/src/config/env.ts` to parse and export the new env vars from T002 with typed defaults (numbers parsed via `Number(...)` with validation; cron expression kept as string).
- [ ] T004 [P] Create `backend/src/config/sources.ts` exporting the typed `SOURCES` catalog constant per `research.md` Decision 6 (arXiv id, displayName, filterKey `"category"`, ~40 seeded category filter values with `value` and `displayName`); export a helper `isKnownSourceFilter(value: string): boolean` used by validation.
- [ ] T005 Extend `backend/prisma/schema.prisma` with the four new models from `data-model.md` (`TrackedTopic`, `Paper`, `TopicPaperMatch`, `FetchCycle`), the `FetchCycleStatus` enum, all documented indexes / unique constraints, and a reverse `trackedTopics TrackedTopic[]` relation on the existing `User` model.
- [ ] T006 Generate the additive migration by running `npx prisma migrate dev --name tracked_topics` from `backend/`; verify the resulting `backend/prisma/migrations/0002_tracked_topics/migration.sql` contains the four `CREATE TABLE`s, the `FetchCycleStatus` enum, the unique index on `TopicPaperMatch(trackedTopicId, paperId)`, and the FK `ON DELETE` clauses (CASCADE for User→TrackedTopic and TrackedTopic→TopicPaperMatch; RESTRICT for Paper←TopicPaperMatch; SET NULL for FetchCycle←TopicPaperMatch).
- [ ] T007 [P] Extend `backend/src/errors.ts` with the typed domain errors used by this feature: `TopicLimitExceededError`, `DuplicateTopicNameError`, `UnknownSourceFilterError`, `UnknownTopicError`, `ArxivClientError`, `ArxivResponseShapeError` — each carrying a stable string `code` matching the contract error codes (`TOPIC_LIMIT_EXCEEDED`, `DUPLICATE_NAME`, `UNKNOWN_SOURCE_FILTER`, `NOT_FOUND`, etc.).
- [ ] T008 [P] Extend `backend/src/validation/schemas.ts` with `createTopicSchema`, `updateTopicSchema` (partial, requires at least one of name/keywords/sourceFilters), `listTopicsQuerySchema`, and `topicPapersQuerySchema` — Zod schemas that pull limits from `config/env.ts` and validate `sourceFilters` items via `config/sources.ts.isKnownSourceFilter`.

**Checkpoint**: Schema is migrated, config + validation + errors are in place. User story implementation can begin.

---

## Phase 3: User Story 1 - Create a Tracked Topic (Priority: P1) 🎯 MVP

**Goal**: An authenticated user can submit a "New Topic" via `POST /api/topics` with name + keywords + sourceFilters, receive `201 Created`, and have the topic persisted under their user account. Per-user name uniqueness (case-insensitive), per-user topic-count limit, and recognized-source-filter validation are enforced server-side.

**Independent Test**: Per `quickstart.md` steps 6–8 — obtain a JWT via 001's login, `GET /api/sources` to confirm the catalog loads, `POST /api/topics` with a valid payload returning `201`, and verify the topic round-trips by listing it. The failure-mode block in step 8 verifies `409 DUPLICATE_NAME` and `422 VALIDATION_FAILED` paths.

### Implementation for User Story 1

- [ ] T009 [P] [US1] Create `backend/src/repositories/trackedTopic.repository.ts` exporting `create(input)`, `countByUser(userId)`, and `findByUserAndNameLower(userId, nameLower)` — Prisma-only, no business logic, takes/returns typed values (not `Request` objects).
- [ ] T010 [P] [US1] Create `backend/src/controllers/sources.controller.ts` with a `GET /api/sources` handler that returns `{ sources: [...] }` per `contracts/sources.md` by reading `config/sources.ts` verbatim; mount behind the 001 `authenticate` middleware.
- [ ] T011 [US1] Create `backend/src/services/topics.service.ts` exporting `createTopic(userId, input)` — trims `name`, computes `nameLower`, de-dupes keywords, validates `sourceFilters` against `config/sources.ts`, enforces `MAX_TOPICS_PER_USER` via `countByUser` (throws `TopicLimitExceededError`), persists via the repository, and translates the Prisma unique-constraint violation on `(userId, nameLower)` into `DuplicateTopicNameError` (depends on T009).
- [ ] T012 [US1] Create `backend/src/controllers/topics.controller.ts` with a `POST /api/topics` handler that parses the body via `createTopicSchema`, calls `topics.service.createTopic`, and maps responses per `contracts/topics.md` (201 on success; 409 on `DUPLICATE_NAME` and `TOPIC_LIMIT_EXCEEDED`; 422 on Zod validation failures and `UNKNOWN_SOURCE_FILTER`; 401 from the auth middleware) (depends on T011).
- [ ] T013 [US1] Wire the new routes in `backend/src/server.ts`: mount the topics router (POST only at this checkpoint) at `/api/topics` and the sources router at `/api/sources`, both behind the 001 `authenticate` middleware (depends on T010, T012).

**Checkpoint**: US1 is fully functional and independently testable via quickstart steps 6–8. MVP is shippable here for the backend slice (the spec accepts US1 alone as the first deliverable increment).

---

## Phase 4: User Story 2 - View, Edit, and Delete Tracked Topics (Priority: P2)

**Goal**: The owning user can list their topics, fetch one by id, edit any of `name` / `keywords` / `sourceFilters`, and delete a topic. Ownership is enforced via repository-layer `userId` filtering; mismatches return `404` (not `403`) to prevent enumeration. Deleting a topic cascades to its `TopicPaperMatch` rows and **only** those — `Paper` rows and other topics' attributions are untouched (FR-006).

**Independent Test**: Per `quickstart.md` steps 13 (PATCH a topic and verify the row updates via Prisma Studio) and step 14 (DELETE a topic and verify `204` + subsequent `404` on GET). The full FR-006 verification across overlapping topics requires US4 to populate data; the deletion-cascade semantics themselves can be verified by inserting a stub `TopicPaperMatch` row by hand and checking that DELETE removes it.

### Implementation for User Story 2

- [ ] T014 [US2] Extend `backend/src/repositories/trackedTopic.repository.ts` with `findByUser(userId, query)` (cursor pagination, sort by `createdAt|updatedAt|name`), `findByIdForUser(userId, id)`, `updateForUser(userId, id, patch)`, and `deleteForUser(userId, id)` — every method filters by `userId` so cross-user reads/writes are impossible at the repo layer.
- [ ] T015 [US2] Extend `backend/src/services/topics.service.ts` with `listTopicsForUser`, `getTopicForUser`, `updateTopic`, and `deleteTopic` — `updateTopic` re-runs the relevant validations (length, sources, name uniqueness on rename) and treats a missing topic as `UnknownTopicError`; `deleteTopic` returns the same `UnknownTopicError` on missing/foreign id (depends on T014).
- [ ] T016 [US2] Extend `backend/src/controllers/topics.controller.ts` with `GET /api/topics`, `GET /api/topics/:id`, `PATCH /api/topics/:id`, and `DELETE /api/topics/:id` handlers per `contracts/topics.md`; map `UnknownTopicError` to `404 NOT_FOUND` (never `403`), `DuplicateTopicNameError` on rename to `409 DUPLICATE_NAME`, and `204 No Content` on successful delete (depends on T015).
- [ ] T017 [US2] Extend route mounting in `backend/src/server.ts` to register the GET-list, GET-one, PATCH, and DELETE handlers on the topics router (depends on T016).

**Checkpoint**: US1 + US2 both work independently. Topics can be created, listed, fetched, edited, and deleted. The fetch pipeline (US3 / US4) is not yet wired, but the topic CRUD surface is complete.

---

## Phase 5: User Story 3 - See Papers Fetched for a Tracked Topic (Priority: P3)

**Goal**: `GET /api/topics/:topicId/papers` returns the paginated list of papers attributed to one topic, joined from `TopicPaperMatch` to `Paper`, in reverse-chronological order by `Paper.publishedAt` (default sort, FR-021), with topic ownership enforced. A topic that has not yet been through a fetch cycle returns `items: []` with `topic.lastFetchedAt: null` (FR-023) rather than an error.

**Independent Test**: Per `quickstart.md` step 9 (empty state before any cycle returns `items: []` and `topic.lastFetchedAt: null`) and step 11 (after data is present, `items` is populated and sorted desc). Until US4 lands, US3 can be exercised by inserting a small `Paper` + `TopicPaperMatch` pair manually via Prisma Studio.

### Implementation for User Story 3

- [ ] T018 [P] [US3] Create `backend/src/repositories/paper.repository.ts` skeleton with `findById(id)` (US4 will extend this file with `upsertBySource`).
- [ ] T019 [P] [US3] Create `backend/src/repositories/topicPaperMatch.repository.ts` with `listByTopic(topicId, query)` — cursor pagination keyed on the active sort field plus `id` (per `contracts/topic-papers.md`), joins to `Paper`, supports `sort=publishedAt|fetchedAt` and `order=asc|desc`.
- [ ] T020 [US3] Create `backend/src/services/papers.service.ts` exporting `listPapersForTopic(userId, topicId, query)` — verifies topic ownership via `trackedTopic.repository.findByIdForUser` (404 on missing/foreign), then reads via `topicPaperMatch.repository.listByTopic` and shapes the response per `contracts/topic-papers.md`, including the `topic` block with `lastFetchedAt` (depends on T014, T019).
- [ ] T021 [US3] Create `backend/src/controllers/topic-papers.controller.ts` with the `GET /api/topics/:topicId/papers` handler that parses query via `topicPapersQuerySchema`, calls `papers.service.listPapersForTopic`, and maps `UnknownTopicError → 404`, Zod failures `→ 422` (depends on T020).
- [ ] T022 [US3] Register the per-topic-papers route in `backend/src/server.ts` under the 001 `authenticate` middleware at `/api/topics/:topicId/papers` (depends on T021).

**Checkpoint**: US3 is independently testable. The empty-state path (FR-023) works without US4. The "papers visible after fetch" path requires either US4 or manual seeding.

---

## Phase 6: User Story 4 - System Periodically Fetches Papers for Active Topics (Priority: P3)

**Goal**: An in-process `node-cron` job runs on `FETCH_CRON_EXPR` (default `0 3 * * *`), iterates every active `TrackedTopic`, queries arXiv per topic over an incremental window (Decision 5), upserts `Paper` rows by `(primarySource, sourcePaperId)`, and creates `TopicPaperMatch` rows — deduplicated at the DB layer via `@@unique([trackedTopicId, paperId])`. Per-topic and per-source failures are isolated (FR-014); deleted-mid-cycle topics are skipped (FR-015); the per-topic per-cycle cap is enforced (FR-017). A `FetchCycle` row records each run's diagnostics (FR-024). On process startup, any `RUNNING` row from a prior crash is promoted to `FAILED`.

**Independent Test**: Per `quickstart.md` steps 10–14 — trigger a cycle via `scripts/run-cycle-once.ts`, verify per-topic logs and the populated `FetchCycle.stats`; re-run to verify the dedup constraint kicks in (`newAttributions=0`); edit a topic and re-run to verify the latest config is used; create overlapping topics, run a cycle, then delete one topic and verify the other still shows shared papers (FR-006 cross-topic preservation).

### Implementation for User Story 4

- [ ] T023 [P] [US4] Create `backend/src/external/arxiv.client.ts` — single-process token-bucket rate limiter enforcing `ARXIV_MIN_REQUEST_INTERVAL_MS` (default 3000) between requests, retry up to `ARXIV_MAX_RETRIES` (default 3) with exponential backoff `5s, 15s, 45s` plus full jitter on 5xx/429, parse Atom XML via `fast-xml-parser` into an unknown shape, then narrow to typed `ArxivEntry[]` via a Zod schema before returning. All exits go through one typed `ArxivClientError` / `ArxivResponseShapeError`.
- [ ] T024 [P] [US4] Create `backend/src/repositories/fetchCycle.repository.ts` with `startCycle()` (insert with status=`RUNNING`), `finalizeCycle(id, status, stats)`, `promoteStuckRunningToFailed()` (startup recovery — annotates `stats.recoveryAction = "promoted-from-running-on-startup"`), and `listLatest(limit)` for future operator use.
- [ ] T025 [P] [US4] Extend `backend/src/repositories/paper.repository.ts` with `upsertBySource({ primarySource, sourcePaperId, ...metadata })` that uses Prisma's `upsert` on the `(primarySource, sourcePaperId)` unique key — no-op on conflict, returns the row either way.
- [ ] T026 [P] [US4] Extend `backend/src/repositories/topicPaperMatch.repository.ts` with `attribute({ trackedTopicId, paperId, cycleId })` that inserts a row and treats the Prisma unique-constraint violation on `(trackedTopicId, paperId)` as "already attributed, return existing row" — never throws on dedup.
- [ ] T027 [US4] Extend `backend/src/repositories/trackedTopic.repository.ts` with `listAllActive()` (for cycle iteration — no `userId` filter; system-internal) and `setLastFetchedAt(topicId, when)` that only succeeds if the topic still exists (used to satisfy FR-015 inside the cycle's per-topic transaction).
- [ ] T028 [US4] Create `backend/src/services/arxiv.service.ts` exporting `searchTopic(topic, windowStart, windowEnd)` — builds the arXiv `search_query` string per `research.md` Decision 2 (`(all:"kw1" OR all:"kw2") AND (cat:c1 OR cat:c2) AND submittedDate:[YYYYMMDDHHMM TO YYYYMMDDHHMM]`), invokes `arxiv.client.ts`, strips `sourcePaperId` version suffixes (e.g., `2403.04102v2 → 2403.04102` per Decision 8), and returns typed `ArxivPaper[]` (depends on T023).
- [ ] T029 [US4] Extend `backend/src/services/papers.service.ts` with `upsertFromArxiv(arxivPaper)` — calls `paper.repository.upsertBySource` with the normalized fields and returns the `Paper.id` for use by the cycle (depends on T025).
- [ ] T030 [US4] Create `backend/src/services/fetchCycle.service.ts` exporting `run()` — opens a `FetchCycle` row, calls `trackedTopic.repository.listAllActive`, for each topic computes `windowStart = topic.lastFetchedAt ?? cycle.startedAt - INITIAL_FETCH_WINDOW_HOURS`, calls `arxiv.service.searchTopic` with per-topic try/catch (FR-014 isolation), upserts each paper via `papers.service.upsertFromArxiv`, attributes via `topicPaperMatch.repository.attribute` (re-checking topic existence to satisfy FR-015), enforces `MAX_NEW_PAPERS_PER_TOPIC_PER_CYCLE` slice (FR-017), updates `topic.lastFetchedAt = cycle.startedAt` **only** on per-topic success, aggregates `stats`, finalizes the cycle as `SUCCEEDED` / `PARTIAL` / `FAILED` (depends on T024, T026, T027, T028, T029).
- [ ] T031 [US4] Create `backend/src/jobs/fetchCycle.job.ts` — a thin shell that imports `node-cron`, registers `FETCH_CRON_EXPR` to invoke `fetchCycle.service.run()`, logs `[scheduler] node-cron registered fetchCycle on "<expr>"`, and contains **no** business logic (Constitution Principle IV) (depends on T030).
- [ ] T032 [US4] Wire startup recovery and scheduler boot in `backend/src/server.ts`: on boot, call `fetchCycle.repository.promoteStuckRunningToFailed()` and log how many rows were recovered, then register the cron job (depends on T031).
- [ ] T033 [P] [US4] Add `backend/scripts/run-cycle-once.ts` — a standalone script that bootstraps the Prisma client, awaits `fetchCycle.service.run()`, and exits, so the quickstart's Option B (`npx tsx scripts/run-cycle-once.ts`) works for manual local testing without waiting for cron (depends on T030; independent of T031/T032 by design).

**Checkpoint**: US4 is independently testable via the run-cycle-once script. With US4 complete, quickstart steps 10–15 all pass end-to-end, including the FR-006 cross-topic deletion verification.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final verification across all stories.

- [ ] T034 [P] Run `npx tsc --noEmit` from `backend/` and confirm zero TypeScript errors; verify no `any` was introduced and `unknown` is only present at the HTTP body and arXiv response boundaries (Constitution Principle III).
- [ ] T035 Run the full `specs/002-topic-subscription/quickstart.md` walkthrough end-to-end against a fresh local DB; record any drift between the contracts and the running implementation and reconcile (typically: fix the implementation; if the contract is wrong, update `contracts/*.md`).
- [ ] T036 [P] Confirm `backend/.env.example` matches the env vars actually read in `backend/src/config/env.ts` (no orphan keys; no missing keys).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1, T001–T002)**: no dependencies — start immediately.
- **Foundational (Phase 2, T003–T008)**: depends on Setup; **BLOCKS all user stories**. Migration (T006) depends on T005; T007/T008 can run in parallel with each other but T008 depends on T003 (env vars) and T004 (sources catalog).
- **US1 (Phase 3, T009–T013)**: depends on Foundational. MVP increment — shippable on its own.
- **US2 (Phase 4, T014–T017)**: depends on Foundational; reuses files from US1 but only extends them (US2 → US1 in **file dependency**, not logical-story dependency — US2 is independently testable once US1's files exist).
- **US3 (Phase 5, T018–T022)**: depends on Foundational; reuses `trackedTopic.repository.findByIdForUser` from T014. Empty-state path works without US4; populated path either needs US4 or a manual seed.
- **US4 (Phase 6, T023–T033)**: depends on Foundational; extends repositories shared with US3 (T025/T026 extend US3 files). US4 produces the data that makes US3 fully meaningful.
- **Polish (Phase 7, T034–T036)**: depends on whichever stories are in scope for the increment being shipped.

### User Story Dependencies (logical)

- **US1 (P1)**: blocks nothing logically, but the topic-CRUD surface it lays down is reused by US2/US3/US4 at the file level (controllers, services, repositories).
- **US2 (P2)**: independently testable once US1's files exist (US2 just extends them).
- **US3 (P3)**: independently testable; needs schema (foundational) and `findByIdForUser` (added in T014, so practically depends on US2's first task or US2 in full).
- **US4 (P3)**: independently testable end-to-end via `scripts/run-cycle-once.ts`. Logically peer to US3 — both deliver the "fetched papers" experience together, but each is verifiable on its own.

### Within Each User Story

- Models / schema (Foundational) **before** services. Services **before** controllers. Controllers **before** route mounting.
- The scheduler boot (T032) wires last; until it runs at least once, US4 results come only from the one-off script (T033).

### Parallel Opportunities

- **Within Setup**: T002 can run in parallel with T001 (different files).
- **Within Foundational**: T004 (sources catalog), T007 (errors), T008 (Zod schemas) are parallelizable with each other once T003 (env) is done. T005 must precede T006 (migration).
- **Within US1**: T009 (trackedTopic repository) and T010 (sources controller) are parallel (different files); T011/T012/T013 are sequential.
- **Within US3**: T018 (paper repo skeleton) and T019 (topicPaperMatch repo) are parallel.
- **Within US4**: T023 (arxiv client), T024 (fetchCycle repo), T025 (paper repo extension), T026 (topicPaperMatch repo extension), T033 (run-once script) are all in different files and parallelizable. T027 extends `trackedTopic.repository.ts` so it serializes against T009/T014.
- **Across stories**: with multiple developers, US2 / US3 / US4 can be developed in parallel after Foundational, with the caveat that they all extend repositories first introduced in earlier phases — git merge discipline matters.

---

## Parallel Example: User Story 4

```bash
# After Foundational + the US3 repo skeletons land, these four US4 tasks can run in parallel
# (each touches a different file):
Task T023: "Create backend/src/external/arxiv.client.ts"
Task T024: "Create backend/src/repositories/fetchCycle.repository.ts"
Task T025: "Extend backend/src/repositories/paper.repository.ts with upsertBySource"
Task T026: "Extend backend/src/repositories/topicPaperMatch.repository.ts with attribute"

# Once T023 lands:
Task T028: "Create backend/src/services/arxiv.service.ts"

# Once T025/T026/T027/T028/T029 land:
Task T030: "Create backend/src/services/fetchCycle.service.ts"
```

---

## Implementation Strategy

### MVP First (US1 only — P1)

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1).
2. **STOP and VALIDATE** with `quickstart.md` steps 1–8.
3. Ship the backend MVP slice (no FE this iteration — REST surface is the deliverable for an FE pickup later).

### Incremental Delivery

1. MVP (above) → topics can be created.
2. Add US2 → topics can be listed / edited / deleted; demo `quickstart.md` step 13.
3. Add US3 → per-topic paper view works (empty state for now); demo step 9.
4. Add US4 → scheduler runs end-to-end; demo steps 10–14, then the full FR-006 cross-topic deletion verification.
5. Polish (Phase 7) before declaring the feature done.

### Parallel Team Strategy

With multiple developers, after Foundational (T003–T008) lands:

- Developer A: US1 (T009–T013), then continue with US2 (T014–T017).
- Developer B: US3 skeleton (T018–T019), then US4 external/repo work (T023–T026, T033).
- Developer C: US4 service + scheduler wiring (T028–T032) once their inputs land.
- Polish (T034–T036) is whoever finishes their increment first.

---

## Notes

- `[P]` tasks operate on different files with no incomplete-task dependencies.
- `[Story]` label maps each task to a single user story for traceability against `spec.md`.
- Each user story is independently testable per its **Independent Test** block above.
- No automated test tasks: testing is via `quickstart.md` (Decision 14 — defer test infra to a hardening pass).
- No frontend tasks: FE integration is deferred (Decision 15); the contracts in `specs/002-topic-subscription/contracts/` are the handoff to the FE slice.
- The two documented Constitution deviations (Next.js at repo root; minimal Paper model before MVP #4) require no task in this list — the first is a no-op for backend work, and the second is satisfied by the `Paper` model defined in T005.
