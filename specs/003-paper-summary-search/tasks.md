# Tasks: Paper Reading Experience (Search, Details, Summaries, Bookmarks, Recommendations)

**Input**: Design documents from `/specs/003-paper-summary-search/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/{search,papers,favorites}.md, quickstart.md

**Tests**: Automated tests are explicitly **out of scope** for this iteration (Decision 15 — manual quickstart only, matching `001` + `002`'s precedent). No `tests/` tasks are generated; verification is via `quickstart.md`.

**Organization**: Tasks are grouped by user story. Phase 3 (US1 search, P1) is the MVP slice. US2 / US3 / US4 (all P2) layer independently on top. US5 / US6 are P3 polish. Frontend integration is **deferred** (Decision 16) — no FE tasks here.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Different files, no dependencies on other incomplete tasks — safe to parallelize.
- **[Story]**: Maps the task to a user story (US1, US2, US3, US4, US5, US6). Setup / Foundational / Polish phases have no story label.
- Every task carries an exact file path.

## Path Conventions

Backend root: `backend/` at the repo root (extending the service from `001-user-auth` and `002-topic-subscription`). Prisma at `backend/prisma/`. Source at `backend/src/`. No frontend changes this iteration.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new dependencies and document the new operator-facing environment variables.

- [ ] T001 Add `@google/generative-ai` as a runtime dependency in `backend/package.json`; run `npm install` from `backend/` to refresh `backend/package-lock.json`.
- [ ] T002 [P] Add the new operator env vars (`GEMINI_API_KEY`, `GEMINI_MODEL`, `AI_PER_CYCLE_SUMMARY_CAP`, `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`, `SEARCH_DEFAULT_LIMIT`, `SEARCH_MAX_LIMIT`, `RECOMMENDATIONS_DEFAULT_LIMIT`, `RECOMMENDATIONS_MAX_LIMIT`) with the defaults from `research.md` (Decisions 1, 7) and `quickstart.md` step 3 to `backend/.env.example`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, config, validation, error types, and the AI infrastructure that every user story below depends on.

**CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T003 Extend `backend/src/config/env.ts` to parse and export the new env vars from T002 with typed defaults (numbers parsed via `Number(...)` with validation; `GEMINI_API_KEY` is required when summarisation is enabled; the rest have sensible defaults per `research.md` Decision 1 / 7).
- [ ] T004 [P] Extend `backend/src/errors.ts` with the typed domain errors used by this feature: `AiClientError`, `AiResponseShapeError`, `SummarizationCapReachedError`, `UnknownPaperError` — each carrying a stable string `code` (`AI_CLIENT_ERROR`, `AI_RESPONSE_SHAPE_ERROR`, `SUMMARY_CAP_REACHED`, `PAPER_NOT_FOUND`) and an HTTP status (502 for AI errors, 404 for unknown paper, 409 for cap reached).
- [ ] T005 [P] Extend `backend/src/validation/schemas.ts` with all Zod schemas this feature needs: `searchPapersQuerySchema` (q, sort, order, limit, cursor, topicId, publishedFrom, publishedTo, author — covers US1 + US5 in one schema), `paperIdParamSchema` (path id), `paperRelatedQuerySchema` (limit), `favoritesAddSchema` (paperId), `favoritesPapersQuerySchema` (limit, cursor). Use env-driven limits for `SEARCH_DEFAULT_LIMIT` / `SEARCH_MAX_LIMIT` / `RECOMMENDATIONS_*`.
- [ ] T006 Extend `backend/prisma/schema.prisma` with the `PaperSummaryStatus` enum (`PENDING_RETRY` / `SUCCEEDED` / `NOT_SUMMARISABLE`), the new `PaperSummary` model (all fields per `data-model.md` §"Model: PaperSummary"), and a reverse `summary PaperSummary?` relation on the existing `Paper` model.
- [ ] T007 Generate the additive migration by running `npx prisma migrate dev --create-only --name paper_summaries` from `backend/`; verify the resulting `backend/prisma/migrations/0003_paper_summaries/migration.sql` contains the `CREATE TABLE PaperSummary`, the `PaperSummaryStatus` enum, the `@@unique([paperId])` constraint, and the FK to `Paper(id) ON DELETE CASCADE`. **Append** the raw SQL `ALTER TABLE Paper ADD FULLTEXT INDEX Paper_title_abstract_fulltext (title, abstract);` to the same migration file (Prisma does not manage MySQL `FULLTEXT` natively — Decision 8). Then run `npx prisma migrate dev` to apply.
- [ ] T008 Create the prompt template in `backend/src/config/prompts.ts` exporting the system + user prompt strings for bullet-summary generation per `research.md` Decision 2 (system prompt requires 3–5 bullets, JSON-only output; user prompt wraps the abstract).

**Checkpoint**: Schema is migrated, env + errors + Zod + prompts are in place. User story implementation can begin.

---

## Phase 3: User Story 1 - Search papers across the user's catalog (Priority: P1) 🎯 MVP

**Goal**: An authenticated user can submit a free-text query and receive a ranked list of matching papers across all of their tracked topics. Empty matches return a clear empty-state. Cross-user data is never exposed. Pagination via cursor.

**Independent Test**: Per `quickstart.md` step 7 — login, `GET /api/search/papers?q=diffusion&limit=5` returns ranked results from the user's catalog; a query like `?q=xyz_unlikely` returns `items: []` with `200`.

### Implementation for User Story 1

- [ ] T009 [US1] Extend `backend/src/repositories/paper.repository.ts` with `searchByUserCatalog({ userId, query, sort, order, limit, cursor, topicId?, publishedFrom?, publishedTo?, author? })` — uses `prisma.$queryRaw` with `MATCH(title, abstract) AGAINST(? IN NATURAL LANGUAGE MODE)` for relevance scoring (Decision 8), joins through `TopicPaperMatch` to filter by `userId`, returns each row with its score and the list of matching topic IDs. Optional filter params are accepted for forward compatibility with US5 (Phase 7); US1 ignores them when undefined.
- [ ] T010 [US1] Create `backend/src/services/search.service.ts` exporting `searchPapers(userId, query)` — calls `paper.repository.searchByUserCatalog`, enriches each result with `isFavorited` (lookup via `favorite.repository.findByUserAndPaper`) and `summaryAvailable` (lookup via `paperSummary.repository.findByPaperId` — created in Phase 4 by T015; in this phase, a temporary `false` literal is acceptable, replaced when US2 lands), produces the `abstractExcerpt` (first ~280 chars), and applies cursor pagination (depends on T009).
- [ ] T011 [US1] Create `backend/src/controllers/search.controller.ts` with a `GET /api/search/papers` handler that parses query via `searchPapersQuerySchema` (T005), calls `search.service.searchPapers`, and maps responses per `contracts/search.md` (200 on success; 400 on Zod failures; 401 from auth middleware) (depends on T010).
- [ ] T012 [US1] Create `backend/src/routes/search.routes.ts` wiring the search controller behind 001's `authenticate` middleware at `/` (depends on T011).
- [ ] T013 [US1] Mount the new router in `backend/src/server.ts` at `/api/search` (depends on T012).

**Checkpoint**: US1 is fully functional and independently testable via quickstart step 7. MVP shippable here.

---

## Phase 4: User Story 2 - View paper details (Priority: P2)

**Goal**: An authenticated user can open a paper from search or per-topic-view and see full metadata, the bullet summary (when available), the bookmark control's current state, and the topics that fetched the paper. Access is granted via current catalog OR via favourite (Decision 10).

**Independent Test**: Per `quickstart.md` step 8 — `GET /api/papers/$PAPER_ID` returns the full shape per `contracts/papers.md`; an unknown / cross-user paper id returns `404`.

### Implementation for User Story 2

- [ ] T014 [P] [US2] Extend `backend/src/repositories/paper.repository.ts` with `findByIdAccessibleToUser(userId, paperId)` — returns the `Paper` row joined to its `summary` if and only if the paper is either attributed to one of the user's `TrackedTopic`s OR favourited by the user (Decision 10 / 14). Returns `null` otherwise.
- [ ] T015 [P] [US2] Create `backend/src/repositories/paperSummary.repository.ts` with `findByPaperId(paperId)` (returns the single row or `null`). The same file is extended in Phase 5 by T021.
- [ ] T016 [US2] Extend `backend/src/services/papers.service.ts` (from `002`) with `getPaperDetailForUser(userId, paperId)` — calls `paper.repository.findByIdAccessibleToUser`, throws `UnknownPaperError` on `null`, enriches with `isFavorited` + `favoritedAt` via `favorite.repository.findByUserAndPaper`, the user's matching topics via `topicPaperMatch.repository`, and the summary section per `contracts/papers.md` §"Summary section variations" (never returns `bullets` unless `status = SUCCEEDED`, enforcing FR-019) (depends on T014, T015).
- [ ] T017 [US2] Create `backend/src/controllers/paper-detail.controller.ts` with a `GET /api/papers/:id` handler that parses `paperIdParamSchema` (T005), calls `papers.service.getPaperDetailForUser`, maps `UnknownPaperError → 404`, Zod failures `→ 400`, auth `→ 401` (depends on T016).
- [ ] T018 [US2] Create `backend/src/routes/papers.routes.ts` wiring `paper-detail.controller.get` at `GET /:id` behind 001's `authenticate` middleware (depends on T017).
- [ ] T019 [US2] Mount the new router in `backend/src/server.ts` at `/api/papers` (depends on T018). Also: update `search.service.searchPapers` (T010) to populate `summaryAvailable` for real now that `paperSummary.repository.findByPaperId` exists (small follow-up edit; if you implemented T010 with the temporary literal, replace it here).

**Checkpoint**: US1 + US2 both work independently. Search lands on a detail view; detail view shows everything except the bullet summary content (`status = PENDING_RETRY` or no row, since US3 hasn't landed yet — the FR-019 "summary not yet available" indicator is shown).

---

## Phase 5: User Story 3 - Automatic bullet-point summaries (Priority: P2)

**Goal**: Newly persisted papers (in `002`'s ingestion cycle) are summarised in 3–5 bullets by Gemini, stored once per paper, shared across all users. Failures are retryable on the next cycle; per-cycle cap protects budget. The detail view (US2) then shows real bullets.

**Independent Test**: Per `quickstart.md` step 9 — run `npx tsx scripts/run-cycle-once.ts`; verify `PaperSummary` rows are created with `status=SUCCEEDED` and 3–5 bullets; verify `GET /api/papers/$PAPER_ID` now returns the bullets via the detail view (US2).

### Implementation for User Story 3

- [ ] T020 [P] [US3] Create `backend/src/external/gemini.client.ts` — wraps `@google/generative-ai`'s SDK with a single `summarize(abstract: string): Promise<{ bullets: string[] }>` method. Uses `responseMimeType: "application/json"` + `responseSchema` per `research.md` Decision 2. Parses the response, narrows it through a Zod schema, and throws `AiClientError` (transient: network / 5xx / 429-equivalent) or `AiResponseShapeError` (malformed JSON / wrong shape).
- [ ] T021 [P] [US3] Extend `backend/src/repositories/paperSummary.repository.ts` (created in T015) with `upsertPending(paperId)` (idempotent — returns existing row if any), `setSucceeded(paperId, { bullets, model })`, `setNotSummarisable(paperId, reason)`. Uses Prisma `upsert` keyed on `@@unique([paperId])` so concurrent writes race safely at the schema layer (Decision 6).
- [ ] T022 [US3] Create `backend/src/services/ai.service.ts` exporting `summarizeAbstract(abstract: string): Promise<{ bullets: string[]; model: string }>` — provider-agnostic interface; v1 implementation calls `external/gemini.client.ts` (T020) and the configured `GEMINI_MODEL` is the `model` returned. Performs abstract length guards: returns a typed `{ kind: "not_summarisable", reason }` for empty / trivially short abstracts, and truncates over-long abstracts per Decision 2 + FR-017 (depends on T020).
- [ ] T023 [US3] Create `backend/src/services/summaries.service.ts` exporting `summarizeIfMissing(paperId)` — reads the paper via `paper.repository.findById`, checks `paperSummary.repository.findByPaperId` and short-circuits if `status = SUCCEEDED` (FR-014); otherwise calls `paperSummary.repository.upsertPending` to claim the row, calls `ai.service.summarizeAbstract`, and writes the result via `setSucceeded` or `setNotSummarisable` per the response. Transient `AiClientError` leaves the row at `PENDING_RETRY` (FR-015). Internal per-cycle counter is exposed via a returned status enum (`succeeded` / `failed_transient` / `failed_permanent` / `skipped`) so the cycle can track the per-cycle cap (depends on T021, T022).
- [ ] T024 [US3] Extend `backend/src/services/fetchCycle.service.ts` (from `002`) so that after each successful per-paper `papers.service.upsertFromArxiv` + `topicPaperMatch.repository.attribute`, it calls `summaries.service.summarizeIfMissing(paperId)` provided the per-cycle counter has not reached `AI_PER_CYCLE_SUMMARY_CAP`. When the cap is reached, remaining papers are skipped (their summaries remain `pending` and will be picked up next cycle — Decision 7). Inter-call pacing respects Gemini's free-tier 15 RPM (Decision 4) — `await new Promise(resolve => setTimeout(resolve, 4000))` between successful calls is sufficient at the default cap. Aggregate cycle stats are extended with `summaries: { attempted, succeeded, failed_transient, failed_permanent, skipped_cap }` (depends on T023).
- [ ] T025 [P] [US3] Add `backend/scripts/backfill-summaries.ts` — standalone script that bootstraps the Prisma client, iterates every `Paper` row without a `summary` (or with `status != SUCCEEDED`), and calls `summaries.service.summarizeIfMissing` for each, respecting `AI_PER_CYCLE_SUMMARY_CAP` and the same inter-call pacing as T024. Logs per-paper outcome and a final summary. Operator-run only (Decision 13) (depends on T023).

**Checkpoint**: US3 is independently testable. Run the cycle, see summaries persist; re-run, see zero new summaries (dedup). Detail view (US2) now displays bullets for summarised papers.

---

## Phase 6: User Story 4 - Bookmark favourite papers (Priority: P2)

**Goal**: The user can bookmark / unbookmark any paper currently in their catalog (FR-024), see all bookmarked papers in a single favourites view with full metadata + summary indicator + current topic context (FR-022), and the bookmark persists even when the source topic is deleted (Decision 10 / Q4 = A). Reuses `001`'s `Favorite` table with no schema change.

**Independent Test**: Per `quickstart.md` step 11 — `POST /api/favorites` succeeds for a catalog paper, fails (`404`) for an out-of-catalog paper; `GET /api/favorites/papers` returns the bookmarked paper with full detail; deleting the source topic does not remove the bookmark.

### Implementation for User Story 4

- [ ] T026 [P] [US4] Extend `backend/src/repositories/favorite.repository.ts` (from `001`) with `listFavoritesWithPaper(userId, { limit, cursor })` — joins each `Favorite` row to `Paper` (left join — favourites with no matching `Paper.id` row produce `paper: null`, per `contracts/favorites.md` §"Three favourite-row states") and to `PaperSummary` (for `summaryAvailable`). Ordered by `Favorite.createdAt DESC`. Also adds `findByUserAndPaper(userId, paperId)` if `001` doesn't already export it (it does — verify and reuse).
- [ ] T027 [US4] Extend `backend/src/services/favorites.service.ts` (from `001`) with two changes: (a) the existing `add(userId, paperId)` is tightened to validate that the paper is currently in the user's catalog at the moment of bookmarking (FR-024) — throws `UnknownPaperError` if not, preventing favouriting arbitrary paper IDs going forward; (b) new `listFavoritePapersWithDetails(userId, query)` that returns the shape from `contracts/favorites.md` §"`GET /api/favorites/papers`" — joins via `favorite.repository.listFavoritesWithPaper`, attaches `summaryAvailable` + the user's CURRENT topics that fetch each paper + the `inCatalog` flag (depends on T026).
- [ ] T028 [US4] Extend `backend/src/controllers/favorites.controller.ts` (from `001`) — add a `listPapers` handler at `GET /api/favorites/papers` that parses `favoritesPapersQuerySchema` (T005), calls `favorites.service.listFavoritePapersWithDetails`, returns the documented shape. Also update the existing `add` handler to map `UnknownPaperError → 404` per `contracts/favorites.md` (depends on T027).
- [ ] T029 [US4] Extend `backend/src/routes/favorites.routes.ts` (from `001`) — add a `GET /papers` route wired to `favorites.controller.listPapers`. Keep all existing routes from `001` unchanged at the HTTP layer (depends on T028).

**Checkpoint**: US4 works independently. Bookmark / unbookmark from any context; favourites view renders the full picture. US1's search and US2's detail view now correctly show `isFavorited`.

---

## Phase 7: User Story 5 - Filter search results (Priority: P3)

**Goal**: The existing `GET /api/search/papers` accepts `topicId`, `publishedFrom`, `publishedTo`, `author` filters; multiple filters combine with AND. Clearing them restores the original result set.

**Independent Test**: Per `quickstart.md` step 12 — apply each filter individually and combinations, verify results monotonically narrow.

### Implementation for User Story 5

- [ ] T030 [US5] Extend `backend/src/services/search.service.ts` (from T010) so the optional filter params accepted by the Zod schema (T005) are passed through to `paper.repository.searchByUserCatalog` (T009). T009 already accepts the params for forward compatibility — implement the WHERE-clause additions in the repository raw SQL now: `AND TopicPaperMatch.trackedTopicId = ?` (when `topicId` is provided and belongs to the user — verify via the existing join), `AND Paper.publishedAt >= ?` / `AND Paper.publishedAt <= ?`, `AND JSON_SEARCH(Paper.authors, 'one', CONCAT('%', ?, '%'), NULL, '$') IS NOT NULL` for `author`. Combines with AND (FR-027).

**Checkpoint**: US5 works. US1 keeps working with filters cleared.

---

## Phase 8: User Story 6 - Related-paper recommendations (Priority: P3)

**Goal**: From a paper's detail view, the user sees up to N related papers scored by metadata similarity (shared topics + shared authors + shared categories + TF-IDF lexical similarity) — scoped to the user's own catalog (FR-031) and excluding the origin paper (FR-030). Empty catalog → `items: []` (not an error).

**Independent Test**: Per `quickstart.md` step 13 — `GET /api/papers/$PAPER_ID/related?limit=5` returns up to 5 related papers; the origin is never included; cross-user papers never appear.

### Implementation for User Story 6

- [ ] T031 [P] [US6] Extend `backend/src/repositories/paper.repository.ts` with `findCandidatesForRecs(userId, originPaperId)` — returns every paper in the user's catalog (via `TopicPaperMatch.trackedTopic.userId = userId`) except `originPaperId`, each row including its `topics[]` (the user's matching topic IDs), the `authors` JSON, and the source categories (parsed from each topic's `sourceFilters`). Order is irrelevant; scoring happens in the service layer.
- [ ] T032 [US6] Create `backend/src/services/recommendations.service.ts` exporting `findRelated(userId, originPaperId, limit)` — loads the origin paper via `paper.repository.findByIdAccessibleToUser` (throws `UnknownPaperError` on `null`), loads candidates via `findCandidatesForRecs` (T031), computes the weighted score per `research.md` Decision 11 (`w_topic=3, w_author=2, w_category=1, w_lexical=2, w_age=0.5` — all env-overridable), implements TF-IDF cosine inline over the user's catalog per Decision 12 (lowercase, whitespace tokens, small stop-word list, IDF computed over the user's catalog at request time), returns the top `limit` results in descending score, decorated with `reasons[]` listing which of `shared_topic / shared_author / shared_category / lexical_similarity` contributed. Excludes the origin paper itself (FR-030). Depends on T031 + the existing `paper.repository.findByIdAccessibleToUser` from T014.
- [ ] T033 [US6] Extend `backend/src/controllers/paper-detail.controller.ts` (from T017) with a `related` handler at `GET /api/papers/:id/related` — parses `paperRelatedQuerySchema` (T005), calls `recommendations.service.findRelated`, maps `UnknownPaperError → 404`, Zod failures `→ 400` (depends on T032).
- [ ] T034 [US6] Extend `backend/src/routes/papers.routes.ts` (from T018) with a `GET /:id/related` route wired to `paper-detail.controller.related` (depends on T033).

**Checkpoint**: US6 works. The detail view (US2) can now show a "related papers" section populated by this endpoint.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final verification across all stories.

- [ ] T035 [P] Run `npx tsc --noEmit` from `backend/` and confirm zero TypeScript errors; verify no `any` was introduced and `unknown` is only present at the HTTP body and Gemini-response boundaries (Constitution Principle III).
- [ ] T036 Run the full `specs/003-paper-summary-search/quickstart.md` walkthrough (steps 1–14) end-to-end against a fresh local DB + a real Gemini API key; record any drift between the contracts and the running implementation and reconcile.
- [ ] T037 [P] Confirm `backend/.env.example` matches the env vars actually read in `backend/src/config/env.ts` (no orphan keys; no missing keys).
- [ ] T038 Update agent context: ensure `CLAUDE.md`'s SPECKIT block continues to point at `specs/003-paper-summary-search/plan.md` (already done by `/speckit-plan`; verify).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1, T001–T002)**: no dependencies — start immediately.
- **Foundational (Phase 2, T003–T008)**: depends on Setup; **BLOCKS all user stories**. T006 must precede T007 (migration); T004 / T005 / T008 can run in parallel after T003.
- **US1 (Phase 3, T009–T013)**: depends on Foundational. MVP increment — shippable on its own.
- **US2 (Phase 4, T014–T019)**: depends on Foundational; T014 + T015 are different files (parallel); T016 depends on both; T019 also touches T010's file (search.service) to wire `summaryAvailable` properly. Logically independent of US1, but US1's `search.service` benefits from US2's `paperSummary.repository` for the `summaryAvailable` flag.
- **US3 (Phase 5, T020–T025)**: depends on Foundational + on T015 (paperSummary repo skeleton from US2). T020 / T021 are independent files; T022 depends on T020; T023 depends on T021 + T022; T024 depends on T023; T025 is independent of T024 (uses T023).
- **US4 (Phase 6, T026–T029)**: depends on Foundational; logically independent of US1/US2/US3. Sequential within the phase because each step extends the same file from the previous step.
- **US5 (Phase 7, T030)**: depends on US1 (extends `search.service` + `paper.repository`). Cannot start before US1 lands.
- **US6 (Phase 8, T031–T034)**: depends on US2 (extends `paper-detail.controller`, `papers.routes`, uses `findByIdAccessibleToUser` from T014). Logically independent of US3 / US4 / US5.
- **Polish (Phase 9, T035–T038)**: depends on whichever stories are in scope for the increment being shipped.

### User Story Dependencies (logical)

- **US1 (P1)**: blocks nothing logically; the search surface stands alone.
- **US2 (P2)**: independently testable. Cross-references `paperSummary.repository` (T015) but works even before US3 lands (shows "summary not yet available").
- **US3 (P2)**: independently testable. Hooks into `002`'s ingestion path (T024); makes US2's detail view show real bullets.
- **US4 (P2)**: independently testable; reuses `001`'s `Favorite` table. US1's search and US2's detail view show `isFavorited` correctly once US4 lands.
- **US5 (P3)**: extends US1 — cannot ship standalone.
- **US6 (P3)**: extends US2 — cannot ship standalone.

### Within Each User Story

- Repositories → services → controllers → routes → mount in `server.ts`.
- Foundational schema + Zod + config must exist before any story task starts.
- Inside each story, sequential edits to the same file serialise; edits to different files can parallelise.

### Parallel Opportunities

- **Within Foundational**: T004 / T005 / T008 are parallelizable with each other once T003 (env) is done. T006 must precede T007 (migration).
- **Within US1**: T009 (paper.repo) and T010 (search.service) touch different files but T010 depends on T009. T011 / T012 / T013 are sequential.
- **Within US2**: T014 (paper.repo extension) and T015 (paperSummary.repo new) are parallel. T016 / T017 / T018 / T019 sequential.
- **Within US3**: T020 (gemini.client) and T021 (paperSummary.repo extension) are parallel. T025 (backfill script) is independent of T024.
- **Within US4**: T026 (favorite.repo) standalone; rest sequential.
- **Within US6**: T031 (paper.repo extension) standalone; T032 depends on it; T033 / T034 sequential.
- **Across stories** (with multiple developers, after Foundational): US1 / US2 / US3 / US4 can be developed in parallel by separate developers, with careful merge discipline on shared files (`paper.repository.ts`, `search.service.ts`, `server.ts`).

---

## Parallel Example: User Story 3

```bash
# After Foundational lands, and after T015 (paperSummary repo skeleton) from US2 — these US3 tasks can run in parallel:
Task T020: "Create backend/src/external/gemini.client.ts"
Task T021: "Extend backend/src/repositories/paperSummary.repository.ts with upsertPending/setSucceeded/setNotSummarisable"
Task T025: "Add backend/scripts/backfill-summaries.ts"

# After T020 lands:
Task T022: "Create backend/src/services/ai.service.ts"

# After T021 + T022 land:
Task T023: "Create backend/src/services/summaries.service.ts"

# After T023 lands:
Task T024: "Extend backend/src/services/fetchCycle.service.ts to call summaries.service per-paper"
```

---

## Implementation Strategy

### MVP First (US1 only — P1)

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1).
2. **STOP and VALIDATE** with `quickstart.md` steps 1–7.
3. Ship the backend MVP slice (no FE this iteration — REST surface is the deliverable for an FE pickup later).

### Incremental Delivery

1. MVP (above) → users can search.
2. Add US2 → search results lead somewhere; demo `quickstart.md` step 8.
3. Add US3 → automatic bullets appear on every newly-fetched paper; demo step 9.
4. Add US4 → bookmark anywhere, favourites view works; demo step 11.
5. Add US5 → search filters work; demo step 12.
6. Add US6 → detail view shows related papers; demo step 13.
7. Polish (Phase 9) before declaring the feature done.

### Parallel Team Strategy

With multiple developers, after Foundational (T003–T008) lands:

- Developer A: US1 (T009–T013), then US5 (T030).
- Developer B: US2 (T014–T019), then US6 (T031–T034).
- Developer C: US3 (T020–T025) — heavier of the four P2 stories; can start in parallel with US2 once T015 lands.
- Developer D: US4 (T026–T029) — independent of the other stories.
- Polish (T035–T038) is whoever finishes their increment first.

---

## Notes

- `[P]` tasks operate on different files with no incomplete-task dependencies.
- `[Story]` label maps each task to a single user story for traceability against `spec.md`.
- Each user story is independently testable per its **Independent Test** block above.
- No automated test tasks: testing is via `quickstart.md` (Decision 15 — defer test infra to a hardening pass).
- No frontend tasks: FE integration is deferred (Decision 16); the contracts in `specs/003-paper-summary-search/contracts/` are the handoff to the FE slice.
- The two documented Constitution deviations (Next.js at repo root; bundling MVP `#5` + `#7` + `#8` + recommendations) require no task in this list — the first is a no-op for backend work, and the second is satisfied by shipping all four story groups in this feature.
