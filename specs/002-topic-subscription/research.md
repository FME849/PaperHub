# Phase 0 Research: Tracked Research Topics with Periodic Paper Fetch

**Branch**: `002-topic-subscription` | **Date**: 2026-05-18 | **Plan**: [plan.md](./plan.md)

This document resolves every unknown raised during Technical Context drafting in `plan.md`. Each section follows **Decision / Rationale / Alternatives considered**. Numbers chosen here are operator-configurable defaults; they MUST be settable from `.env` per Constitution Principle V.

---

## Decision 1: arXiv as the only source backend in v1

**Decision**: The v1 fetcher integrates **only** with the arXiv Export API at `https://export.arxiv.org/api/query`. The data model and `Source` abstraction allow additional sources to be added later without breaking existing tracked topics.

**Rationale**: The Paper Hub Constitution (Principle I) names arXiv as the external paper source. The spec's Assumptions section already pins v1 to arXiv. Adding more sources (PubMed, OpenAlex, Semantic Scholar) is out of scope per the spec.

**Alternatives considered**: Multi-source from day one (PubMed + arXiv). Rejected — multiplies query-shape, rate-limit, and identifier-normalization concerns without serving v1 acceptance scenarios.

---

## Decision 2: arXiv query construction — keywords + categories + date range

**Decision**: Each per-topic arXiv query is built as a `search_query=` expression of the form:

```text
(all:"<kw1>"+OR+all:"<kw2>"+OR+...)+AND+(cat:<cat1>+OR+cat:<cat2>+...)+AND+submittedDate:[YYYYMMDDHHMM+TO+YYYYMMDDHHMM]
```

- Each keyword is quoted (phrase match across all fields via `all:`). Keywords are combined with `OR` (a paper matching any keyword is a candidate).
- Categories from the topic's source filters are combined with `OR` (paper matching any selected category is a candidate).
- A `submittedDate` range bounds the incremental window (see Decision 5).
- Results sorted by `submittedDate` descending; max 200 results per query (FR-017 cap is enforced server-side after fetch — see Decision 7).

**Rationale**: arXiv's documented query grammar supports field-scoped boolean expressions. `all:` matches the union of title, abstract, authors, comment — the right default for research watch (high recall). Wrapping each keyword in quotes turns multi-word keywords into phrase matches (e.g., `"diffusion model"`), which is the user's mental model when they type a multi-word keyword.

**Alternatives considered**:

- `ti:` (title only) or `abs:` (abstract only). Rejected as too narrow — would miss papers where the term appears in the comment or author affiliation; users would have to guess where the term will appear.
- AND of keywords (every keyword must match) instead of OR. Rejected — for a research watch with N keywords, AND is too restrictive; users will likely use synonyms (e.g., "diffusion", "denoising", "score-based") expecting any match.
- A user-exposed "AND vs OR" toggle. Rejected for v1 — adds UX complexity not justified for an MVP. Defer to a future "advanced query" feature.

---

## Decision 3: arXiv response parsing via `fast-xml-parser` with Zod narrowing

**Decision**: Parse arXiv's Atom XML response with `fast-xml-parser`, then narrow the parsed object through a Zod schema before passing it out of `arxiv.client.ts`. Untyped XML never leaves the external client.

**Rationale**: `fast-xml-parser` is well-maintained, zero-deps, and ~3× faster than `xml2js`. Validating the parsed structure with Zod at the client boundary satisfies Constitution Principle III (`unknown` only at boundaries, narrowed before use) and Principle IV (external service responses translated to typed values before reaching services).

**Alternatives considered**:

- `xml2js`. Rejected — slower, callback-style API, larger install footprint.
- Hand-rolled string parsing. Rejected — XML namespaces and entity escaping make this brittle.

---

## Decision 4: Scheduler — `node-cron` running in the same Express process

**Decision**: Use `node-cron` to run `jobs/fetchCycle.job.ts` on a cron expression read from `FETCH_CRON_EXPR` (default `0 3 * * *` — 03:00 UTC daily). The job is a thin shell that calls `fetchCycle.service.run()`. The scheduler runs in the same Node process as the Express API.

**Rationale**:

- For < 100 users (pre-MVP scale per plan), an in-process scheduler is the simplest viable option and matches Constitution Principle IV's requirement that "scheduled fetching MUST call backend services rather than embedding business logic in scheduler code."
- `node-cron` is mature, < 50 KB, and offers a stable cron expression API.
- 03:00 UTC is low-traffic for both arXiv (their daily update happens around 00:00 UTC) and our future users (assumed US/EU timezones for the academic audience), so the cycle runs against fresh data without competing with peak traffic.

**Alternatives considered**:

- BullMQ + Redis. Rejected — adds a new infra dependency (Redis) and operational surface for a workload that does not need horizontal scaling at pre-MVP scale. Acceptable upgrade path if cycles outgrow a single process.
- `setInterval`. Rejected — no cron-style expressiveness, no graceful behavior across process restarts.
- External cron (system `cron` or a CI workflow) calling an internal HTTP endpoint. Rejected — would require building an internal auth surface for the endpoint, and weakens FR-012's autonomy guarantee unless explicitly owned by this feature. `node-cron` keeps the cycle inside the service boundary.

**Notes**:

- The cron expression is in `.env`; switching to every-15-minutes for local testing is just an env change.
- If the process restarts mid-cycle, the in-flight cycle is lost; the next scheduled fire picks up. Missed cycles are not "caught up" — by design (FR-018 incremental window means the next cycle's window simply extends back to cover the gap; see Decision 5).

---

## Decision 5: Incremental window — per-topic `lastFetchedAt`, with global cycle floor

**Decision**: Each `TrackedTopic` row stores `lastFetchedAt` (nullable; set after the topic's first successful fetch). At the start of a cycle, for each active topic, the fetcher computes:

```text
windowStart = topic.lastFetchedAt ?? cycle.startedAt - cadenceInterval
windowEnd   = cycle.startedAt
```

…and queries arXiv for `submittedDate:[windowStart TO windowEnd]`. On successful per-topic completion, the topic's `lastFetchedAt` is updated to `windowEnd`. On per-topic failure, `lastFetchedAt` is **not** updated, so the next cycle's window naturally widens to cover the missed period (FR-018, FR-014).

**Rationale**:

- Per-topic tracking is required because topics are created at different times; a single global "last cycle" timestamp would cause newly created topics to over-fetch (back to the global last cycle) or under-fetch (only to "now", missing freshly created topics' first window).
- Per-topic-per-source tracking would be more precise (different sources may be available at different times) but adds complexity without payoff in v1 (single source). When a second source is added, this column can be normalized into a `(topic, source) → lastFetchedAt` join row without breaking existing topics.
- Not updating `lastFetchedAt` on failure is the natural retry mechanism — it satisfies FR-014 ("retry that source on the next cycle") without needing a separate retry queue.

**Brand-new topics (Option A — no backfill)**: a topic created today with `lastFetchedAt = null` and a cycle running today will compute `windowStart = cycle.startedAt - cadenceInterval`, i.e., the topic only sees papers from the last cadenceInterval (e.g., last 24h). It will NOT see historical papers from before its creation that happen to fall within that window. This is the spec's promise (FR-019); the cadence interval simply bounds the worst-case "first cycle" window.

**Alternatives considered**:

- Global cycle floor only. Rejected (over- or under-fetches newly created topics).
- Persisting `(topic, source) → lastFetchedAt` from day one. Rejected — premature normalization; v1 has one source.
- Querying arXiv's "incremental update" feed (OAI-PMH). Rejected for v1 — different protocol, different rate limits; doable as a research path if cycle load grows.

---

## Decision 6: Source catalog — in-code constant, not a DB table

**Decision**: The set of recognized sources and source-specific filter values lives in `backend/src/config/sources.ts` as a strongly-typed constant. v1 contents:

```ts
export const SOURCES = {
  arxiv: {
    id: 'arxiv',
    displayName: 'arXiv',
    filterKey: 'category',
    filterValues: [
      { value: 'cs.AI',  displayName: 'Artificial Intelligence' },
      { value: 'cs.LG',  displayName: 'Machine Learning' },
      { value: 'cs.CL',  displayName: 'Computation and Language' },
      // ... seed with the ~40 most-used categories; full list documented in sources.ts
    ],
  },
} as const;
```

The `GET /api/sources` endpoint serves this constant verbatim so the (future) frontend can render the source picker. Validation of incoming `sourceFilters` arrays during topic create/edit is done by Zod against the same constant.

**Rationale**:

- The catalog changes when WE add or refine source support, not when users do anything. Persisting it in MySQL would mean operating a seed migration on every catalog change and reconciling DB state against code expectations — pure overhead for v1.
- Constitution Principle V: "All environment variables MUST be centralized in backend configuration." A typed in-code constant is the natural extension for non-secret static config.
- The data model's `TrackedTopic.sourceFilters` stores filter values (e.g., `"arxiv:cs.AI"`) as strings, so adding a new arXiv category later requires only a code update — existing topics' filter strings remain valid because we only *add* values, never rename.

**Alternatives considered**:

- DB-backed `Source` and `SourceFilterValue` tables. Rejected — adds two tables, a seed step, and a sync risk for zero current user benefit. Can be promoted to DB later if user-created sources are ever in scope (out of v1 scope per Assumptions).

---

## Decision 7: Per-user / per-topic / per-cycle limits (FR-011, FR-017)

**Decision**:

| Limit | Default | Env var |
|-------|---------|---------|
| Max tracked topics per user | **20** | `MAX_TOPICS_PER_USER` |
| Max keywords per topic | **15** | `MAX_KEYWORDS_PER_TOPIC` |
| Max source filters per topic | **10** | `MAX_FILTERS_PER_TOPIC` |
| Max characters per keyword | **80** | `MAX_KEYWORD_LENGTH` |
| Max characters per topic name | **120** | `MAX_TOPIC_NAME_LENGTH` |
| Max newly attributed papers per topic per cycle (FR-017) | **50** | `MAX_NEW_PAPERS_PER_TOPIC_PER_CYCLE` |

**Rationale**:

- 20 topics per user is generous for a single researcher who tracks 3–5 active threads with a few exploratory side-watches. Above this number, the personalized view becomes a firehose; UX research on "saved search" features (Google Scholar Alerts, Inoreader) shows users rarely exceed ~10 active saved searches.
- 15 keywords per topic supports a comfortable synonym set (e.g., for "diffusion models": diffusion, denoising, score-based, DDPM, DDIM, latent diffusion, ...) without becoming a wildcard.
- 10 source filters per topic comfortably covers arXiv's broad categories within a sub-area (e.g., a "biology + chemistry" cross-disciplinary topic might pull from `q-bio.BM`, `q-bio.MN`, `q-bio.QM`, `physics.bio-ph`, etc.).
- 50 papers per topic per cycle is enough for any reasonable daily fresh-paper count in even very active arXiv categories (`cs.LG` peaks around 100–200 papers/day total, of which a single topic's keyword set typically matches a single-digit subset), while bounding the noise from accidentally broad keywords like "AI".

**All limits are operator-configurable from `.env`** so they can be tightened or relaxed without code changes.

**Alternatives considered**:

- Hard-coded constants without env override. Rejected — Constitution Principle V centralizes config in env vars.
- Lower per-cycle cap (e.g., 10). Rejected — would hide genuinely productive days in active fields.

---

## Decision 8: Paper identity and de-duplication key

**Decision**: A `Paper` row is uniquely identified by `(primarySource, sourcePaperId)`. For arXiv, `sourcePaperId` is the canonical arXiv ID **including version stripped** (e.g., `2403.04102` not `2403.04102v2`) and `primarySource = 'arxiv'`. A `Paper.sourceUrl` column holds the canonical abstract page URL for display. `TopicPaperMatch` has a unique constraint on `(trackedTopicId, paperId)` enforcing FR-013.

**Rationale**:

- Stripping the version normalizes against arXiv's habit of returning a versioned ID; otherwise a paper that re-uploads as v2 would be treated as a new paper and re-attributed, violating FR-013.
- Future sources will have their own native identifiers (DOI for PubMed, OpenAlex IDs, etc.); the `(primarySource, sourcePaperId)` composite generalizes cleanly without forcing a DOI-only world.
- The dedup constraint at the DB level (unique index on `TopicPaperMatch(trackedTopicId, paperId)`) makes FR-013 a property of the schema, not just service code — re-running a cycle can never violate it.

**Alternatives considered**:

- Dedup by `sourceUrl`. Rejected — arXiv URLs sometimes include or omit the version suffix; relying on URL equality is brittle.
- Dedup by `(title, authors)`. Rejected — too fuzzy; minor metadata churn would produce duplicates.

---

## Decision 9: Authors representation in `Paper`

**Decision**: Store `Paper.authors` as a `JSON` column containing an ordered array of strings: `["Alice Smith", "Bob Jones"]`. No `Author` table in v1.

**Rationale**:

- For v1 (per-topic list view), the only thing we do with authors is display them. A separate `Author` table with a join would buy nothing.
- Future MVP #7/#8 (search/filter, paper detail) may want author search, at which point an `Author` table is a clean follow-up migration. JSON-now → table-later is a one-way upgrade with no destructive change to existing `Paper` rows (the JSON column can stay as a denormalized cache or be dropped after backfill).

**Alternatives considered**:

- `Author` + `PaperAuthor` join tables now. Rejected — premature normalization for zero v1 benefit.
- Single comma-separated string. Rejected — fragile for names containing commas (e.g., "Smith, Jr.").

---

## Decision 10: Rate limiting against arXiv — per-process token bucket (3 s minimum spacing)

**Decision**: `external/arxiv.client.ts` enforces a minimum spacing of **3 seconds between requests** via a simple async token bucket. All arXiv calls (across all topics in a cycle) go through this client and serialize at the bucket. On HTTP 5xx or 429, retry up to **3 times** with exponential backoff starting at 5 s (5 s, 15 s, 45 s) and full jitter. After 3 failures, the per-topic call returns a typed error; the cycle records the failure (does NOT update `topic.lastFetchedAt`) and continues with the next topic (FR-014).

**Rationale**:

- 3 s spacing matches arXiv's documented courteous rate. Going faster risks blocks, costs us goodwill, and offers no user-visible benefit at our scale (20 topics × 1 query = 60 s per cycle is fine inside a daily window).
- 3 retries with full-jitter exponential backoff is the standard "respect upstream hiccups without amplifying them" pattern.
- Not updating `lastFetchedAt` on failure folds retry into the next scheduled cycle (Decision 5), so we don't need a separate retry queue.

**Alternatives considered**:

- Concurrent requests with a per-second limit. Rejected — adds complexity without throughput benefit at our query count.
- Circuit breaker. Rejected as overengineering for v1; the natural next-cycle retry covers the common case.

---

## Decision 11: Query coalescing across users — deferred

**Decision**: v1 issues one arXiv query per (topic, cycle) pair. We do NOT coalesce identical queries across users.

**Rationale**:

- At < 100 users with up to 20 topics each, the worst case is < 2,000 queries per cycle; at 3 s spacing that is < 100 minutes — within a daily cadence with margin to spare.
- Coalescing introduces a query-shape hashing layer, fan-out logic, and a per-paper "which topic(s) does this match" reconciliation step. Worth it later; over-engineering now.
- The cycle still de-dups *per topic* via the `TopicPaperMatch` unique constraint, so functional correctness is independent of coalescing.

**Alternatives considered**: Pre-compute "query buckets" of (category-set, keyword-set, window) and fan results out. Documented for a future iteration once query volume becomes a real constraint.

---

## Decision 12: `FetchCycle` table for diagnostics and idempotency

**Decision**: Persist a `FetchCycle` row per scheduled run with `id`, `startedAt`, `finishedAt` (nullable until completion), `status` (`running` | `succeeded` | `failed` | `partial`), and a JSON `stats` column containing per-source success/failure counts and per-topic match counts (FR-024). On startup, if a `running` row exists from a prior process that died, it is marked `failed` on the next cycle start; in-flight per-topic state is recovered from the topics' `lastFetchedAt` (which was only ever updated on per-topic success), so no double-attribution can occur (FR-013, FR-016).

**Rationale**:

- Operators need cycle-level diagnostics (FR-024); a single SQL row per cycle is the cheapest accountable form.
- Crash recovery requires a deterministic "what state did we leave behind?" answer — the answer is "look at `running` rows and at each topic's `lastFetchedAt`."
- The table is internal (no REST endpoint in v1 — Key Entities marks it system-internal); future operator tooling can read it directly.

**Alternatives considered**:

- Logs only, no table. Rejected — losing structured queryability over diagnostic state is painful when investigating a missed cycle.
- Per-topic-per-cycle row. Rejected as too granular for v1; a JSON `stats` column on the cycle row gives the same answers with one row per cycle.

---

## Decision 13: Authentication — reuse 001's JWT bearer + `authenticate` middleware

**Decision**: All `/api/topics`, `/api/topics/:id/papers`, and the `GET /api/sources` endpoints are mounted behind the existing `authenticate` middleware from 001. The middleware verifies the JWT and attaches `req.userId`. No new auth surface is introduced.

**Rationale**: FR-008 requires valid authentication on every action. 001 already ships a working middleware. Adding a second mechanism would violate Principle I's stack constraints and double the attack surface.

**Alternatives considered**: Opening `GET /api/sources` as a public endpoint. Rejected — keeping every endpoint authenticated is simpler and matches the spec's blanket "valid authentication required" requirement.

---

## Decision 14: Testing posture — manual quickstart only

**Decision**: This iteration ships with a manual `quickstart.md` and no automated tests, matching 001's precedent. A follow-up plan will introduce Vitest + Supertest before the hardening pass.

**Rationale**: Consistency with 001. The user's standing "skip security and performance for now" directive (recorded in 001's plan) extends naturally to "skip the test-infrastructure bootstrap" for this iteration.

**Alternatives considered**: Vitest + Supertest now. Rejected for consistency with 001; planned as a dedicated follow-up.

---

## Decision 15: Frontend deferral

**Decision**: This feature ships backend only. No `src/app/topics/*`, no API client, no React components in this iteration.

**Rationale**: Working agreement with another teammate who owns the frontend reorg: backend ships first, FE integration follows separately. The REST contracts in `contracts/` are the handoff artifact.

**Alternatives considered**: Ship a minimal FE alongside. Rejected to avoid stepping on the parallel FE reorg work.

---

## Open Questions / Future Iterations

None blocking v1. Items to revisit in a follow-up:

- Query coalescing across users (Decision 11) when query volume becomes a real constraint.
- Per-`(topic, source)` `lastFetchedAt` normalization (Decision 5) when a second source is added.
- DB-backed `Source` catalog (Decision 6) if user-created sources become in-scope.
- Notifications / digest channel (spec FR-026) when MVP #5 (summaries) ships and there's something worth sending.
- On-demand "refresh now" + keyword suggestions (deferred per spec) once usage data shows whether they're needed.
- Vitest + Supertest test infra (Decision 14) before the hardening pass.
