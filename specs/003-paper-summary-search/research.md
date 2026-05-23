# Phase 0 Research: Paper Reading Experience

**Branch**: `003-paper-summary-search` | **Date**: 2026-05-23 | **Plan**: [plan.md](./plan.md)

This document resolves every unknown raised during Technical Context drafting in `plan.md`. Each section follows **Decision / Rationale / Alternatives considered**. Numbers chosen here are operator-configurable defaults; they MUST be settable from `.env` per Constitution Principle V.

---

## Decision 1: AI provider and model — Google Gemini, `gemini-2.0-flash`

**Decision**: Use **Google Gemini** as the v1 AI provider, called via the official `@google/generative-ai` Node SDK. Model: `gemini-2.0-flash` (operator-configurable via `GEMINI_MODEL`). The constitution's recent amendment (v2.1.0) generalised Principle I to be provider-agnostic and named Gemini as the v1 default; this Decision is the concrete instantiation of that.

**Rationale**:

- **Free tier**: as of v1, Gemini's free tier covers `gemini-2.0-flash` at 15 RPM / 1500 RPD with 1M tokens/day. That is comfortably above the expected per-cycle workload at pre-MVP scale (< 100 summaries per ingestion cycle by default; see Decision 7).
- **Quality**: `gemini-2.0-flash` is in the current-generation flagship family with strong instruction-following on summarisation tasks. JSON-mode equivalent (`response_mime_type: "application/json"` plus a `response_schema`) is supported, which we lean on for structured-output reliability (see Decision 2).
- **Cost**: free at the volume we operate. Even on paid tier the per-summary cost is fractions of a cent — much smaller than the per-cycle budget cap.
- **Operator override**: `GEMINI_MODEL` env var lets operators switch to `gemini-2.5-flash` or `gemini-1.5-pro` if quality demands it. Future provider swaps (e.g., to OpenAI) are a plan-level decision per constitution §"Default AI Provider Selection" and stay inside `external/gemini.client.ts` + `services/ai.service.ts`.

**Alternatives considered**:

- **OpenAI `gpt-4o-mini`**. Rejected for v1: no free tier; the operator's account currently lacks billing access. Strong upgrade candidate if/when paid access is restored — would slot in behind the same `ai.service.ts` interface with only `external/gemini.client.ts` swapped for `external/openai.client.ts`.
- **`gemini-2.5-flash`**. Rejected as a default — slightly higher quality but rate-limited more aggressively on the free tier; operators can flip via `GEMINI_MODEL` if they hit quality issues.
- **`gemini-1.5-pro`**. Rejected — slower, more rate-limited; overkill for abstract summarisation.
- **Self-hosted model (e.g., a local LLM via Ollama)**. Rejected — adds deployment complexity, lower quality at our hardware budget; can revisit if data-sovereignty concerns surface.
- **Anthropic Claude**. Rejected for v1 — no free tier comparable to Gemini's; same upgrade path applies if paid access becomes available.

---

## Decision 2: Prompt design — explicit bullet format with structured JSON output

**Decision**: A single system-prompt + user-message pair instructs the model to return a JSON object containing exactly a `bullets` field (3–5 short strings). The Gemini call uses `generationConfig.responseMimeType = "application/json"` plus a `responseSchema` describing the expected shape — Gemini's equivalent of structured-output mode. The response is parsed and narrowed by a Zod schema before persistence.

```ts
// Sketch — actual prompt lives in backend/src/config/prompts.ts
const SYSTEM = `You convert scientific paper abstracts into concise bullet-point summaries.
Output STRICTLY a JSON object of the shape:
  { "bullets": string[] }
The "bullets" array must contain 3 to 5 entries. Each entry is one phrase or short sentence (≤ 25 words).
No prose, no preamble, no markdown, just the JSON object.`;

const USER = (abstract: string) =>
  `Abstract:\n${abstract}\n\nReturn the JSON object now.`;

// Sketch — actual SDK call inside external/gemini.client.ts
const result = await model.generateContent({
  contents: [
    { role: "user", parts: [{ text: `${SYSTEM}\n\n${USER(abstract)}` }] },
  ],
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: {
      type: "object",
      properties: {
        bullets: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
      },
      required: ["bullets"],
    },
  },
});
```

**Rationale**: Gemini's `responseMimeType: "application/json"` + `responseSchema` gives us a deterministic shape with model-side validation as a first line of defence. A Zod schema in `ai.service.ts` is the second line — it catches schema drift from the model (an entry returning prose, wrong field name, etc.) and produces a clean failure path (mark `not_summarisable`, log, retry on next opportunity per FR-015). Bullet count `3–5` matches the spec (FR-012). The `≤ 25 words` per bullet is a soft guideline in the prompt — not enforced server-side because over-length is not a correctness failure.

The same Zod schema also acts as the natural decoupling point if the provider is swapped later: any future `external/openai.client.ts` (or other) returns the same parsed shape to `ai.service.ts`.

**Alternatives considered**:

- Free-text response with regex parsing. Rejected — brittle; model output drifts over versions.
- Gemini function-calling (tool use). Rejected as overkill — JSON mode with schema is simpler and sufficient.
- Plain prompt without `responseSchema`. Rejected — relying on the prompt alone for structure invites occasional schema drift; the schema is cheap insurance.

---

## Decision 3: Summary persistence — single JSON column for `bullets`

**Decision**: `PaperSummary.bullets` is a Prisma `Json` column holding an ordered array of strings. Status tracked in `PaperSummary.status` (`SUCCEEDED` / `PENDING_RETRY` / `NOT_SUMMARISABLE`). One row per paper.

**Rationale**:

- 3–5 short strings is a tiny denormalised shape. Splitting into a `PaperSummaryBullet` child table would buy nothing — there's no per-bullet query, no per-bullet edit, no sort beyond array order.
- A single row per paper with a `JSON` array of bullets keeps the API contract trivial (`bullets: string[]`) and the storage cost minimal.
- The `status` enum lets the UI distinguish "not yet generated" from "permanently unsummarisable" without a special-cased nullable `bullets` field interpretation.

**Alternatives considered**:

- Separate `PaperSummaryBullet` child table. Rejected — over-normalised for the access pattern.
- Concatenated bullets with separator. Rejected — fragile and not type-safe.

---

## Decision 4: Summarisation trigger — post-persistence hook inside the existing `fetchCycle.service`

**Decision**: `services/fetchCycle.service.ts` (from `002`) is extended so that after each per-paper `papers.service.upsertFromArxiv()` succeeds and the attribution is written, the cycle invokes `summaries.service.summarizeIfMissing(paperId)`. This call is **synchronous within the cycle** for v1 (no separate queue), bounded by `AI_PER_CYCLE_SUMMARY_CAP`. Per-call pacing inside the cycle respects Gemini's free-tier 15 RPM limit (Decision 1) — `summaries.service` keeps a minimum spacing between AI calls so a single cycle cannot exceed the upstream rate even on bursty input.

**Rationale**:

- Keeps Constitution Principle IV's "one scheduler entry point" property — there's still only one cron registration (`002`'s `fetchCycle.job.ts`).
- Synchronous within the cycle means a paper persisted in cycle N has its summary by the end of cycle N (or marked `PENDING_RETRY`), making SC-004 trivially achievable.
- Per-cycle cap is a single integer check at the call site; reaching the cap simply marks remaining papers `PENDING_RETRY` for the next cycle.
- No new infra (no queue, no second cron) means lower operational complexity for the same correctness.

**Alternatives considered**:

- Separate scheduled summarisation job. Rejected — adds a second cron entry, complicates failure recovery, and provides no benefit at current scale.
- Async queue (BullMQ + Redis). Rejected — same scale arguments as `002` Decision 4; correct upgrade path if cycles outgrow a single process.
- Inline within `arxiv.service.searchTopic`. Rejected — violates separation of concerns; `arxiv.service` should not know about the AI service.

---

## Decision 5: Retry policy for failed summaries

**Decision**: When `summaries.service.summarizeIfMissing` is called and the row's status is `PENDING_RETRY` (or absent), the service re-attempts the AI call via `ai.service`. If the call fails with a transient error (network, 5xx, 429-equivalent), the status stays `PENDING_RETRY` and the next ingestion cycle will retry it. There is no exponential backoff inside a single cycle — one attempt per cycle is sufficient because cycles already run on a cadence (every 6 hours by default in `002`).

`AI_MAX_RETRIES` (default 1) controls per-call retries inside one cycle. Set higher if Gemini transient flakiness justifies it. Permanent failures (Gemini SDK reports a 4xx-equivalent that is not 429 / not transient) mark the row `NOT_SUMMARISABLE` with a logged reason. 429-equivalent (free-tier rate exhausted in the current minute) is treated as transient — the row stays `PENDING_RETRY` and the next cycle attempts it.

**Rationale**: We already have a natural retry rhythm — the ingestion cycle. Aggressive intra-call retries are unnecessary and risk amplifying upstream incidents. The cycle cadence (~6 h) means a transient failure self-heals within hours.

**Alternatives considered**:

- Exponential backoff inside a single cycle. Rejected — increases time-to-cap for transient incidents, hurting throughput for other papers in the same cycle.
- Cross-cycle exponential backoff. Rejected — bookkeeping for a marginal improvement.

---

## Decision 6: Concurrency / dedup — DB unique constraint

**Decision**: `PaperSummary.@@unique([paperId])` enforces one summary per paper at the schema layer (FR-013). `summaries.service.summarizeIfMissing(paperId)` performs a `findUnique` first; if a row exists with status `SUCCEEDED`, it returns immediately without an AI call. If two cycles race (unlikely given Decision 4's synchronous trigger, but defended), the second `INSERT` hits P2002 and is treated as "already summarised, OK."

**Rationale**: Constraints at the DB layer make FR-013 / FR-014 properties of the schema, not assertions in service code. Race-condition correctness comes "for free."

**Alternatives considered**:

- Application-level lock (mutex, semaphore). Rejected — process-local; doesn't survive multiple replicas.
- Distributed lock (Redis). Rejected — overkill at current scale.

---

## Decision 7: Per-cycle cap

**Decision**: `AI_PER_CYCLE_SUMMARY_CAP` (default **50** on the Gemini free tier). When the cycle hits the cap, remaining un-summarised papers are marked `PENDING_RETRY` and addressed in the next cycle.

**Rationale**:

- Gemini's free tier allows 15 RPM and 1500 RPD on `gemini-2.0-flash`. At 15 RPM the cycle can do ~50 calls in ~3.5 minutes — comfortably within a 6-hour cycle (`002`'s default cadence) and safely below the daily request quota. The cap is conservative for the free tier; operators on paid plans can raise it via env.
- At our pre-MVP scale (< 100 users × < 200 papers / user catalog), steady-state per-cycle ingestion is well under 50 new papers — the cap is a safety valve, not a daily constraint.
- Catching up after an extended outage takes several cycles, which is acceptable per FR-018's "queue remaining for the next opportunity."

**Alternatives considered**:

- No cap (unbounded). Rejected — cost guardrail is required by FR-018.
- Per-user cap. Rejected — users do not trigger summarisation, so per-user accounting is meaningless (per spec assumption "There is no per-user cap in v1").

---

## Decision 8: Search method — MySQL `FULLTEXT` index on `Paper(title, abstract)` with Prisma raw query

**Decision**: Add a `FULLTEXT` index covering `Paper.title` and `Paper.abstract`. Search uses MySQL `MATCH(title, abstract) AGAINST(? IN NATURAL LANGUAGE MODE)` via `prisma.$queryRaw` (the search-by-user-catalog repository method is the **only** place raw SQL is used in this feature; everything else goes through Prisma's typed queries). Results are joined to `TopicPaperMatch` to scope by user and to surface attributing topics.

Author search is a separate path: `Paper.authors` is JSON, so author matching uses `JSON_CONTAINS` for filter-style "papers by author X" but is also folded into the relevance scoring when the search term plausibly matches an author name (substring match on the JSON string).

**Rationale**:

- MySQL's built-in `FULLTEXT` index gives us relevance scoring (`MATCH ... AGAINST`) for free — better than `LIKE '%term%'` which can't rank.
- At our scale (hundreds of rows per user), the index is overkill in absolute performance terms but trivial in storage and operational cost.
- Single raw-SQL touchpoint stays inside `paper.repository.ts`. Controllers and services see only typed `Paper[]` (plus a score field).
- No new infrastructure (no Elasticsearch, no Meilisearch). Upgrade path is clear if user counts grow past what MySQL `FULLTEXT` comfortably handles.

**Alternatives considered**:

- Plain `LIKE '%term%'`. Rejected — no relevance ranking; SC-002 (relevant paper in top 5 for 90% of queries) is unachievable without ranking.
- External search engine (Meilisearch, Elastic). Rejected as v1 over-engineering. Acceptable upgrade path.
- ORM-side scoring (compute TF-IDF in TypeScript). Rejected — duplicates what MySQL already does well.

---

## Decision 9: Search default sort and filters

**Decision**:

- Default sort: relevance descending (the `MATCH ... AGAINST` score). Ties broken by `Paper.publishedAt` descending.
- Available filters (US5 / FR-026):
  - `topicId` — restrict to one of the user's own topics.
  - `publishedFrom`, `publishedTo` — date range on `Paper.publishedAt`.
  - `author` — substring match on any entry in `Paper.authors`.
- Pagination via cursor (last `(score, id)` tuple), max page size 50 (`SEARCH_MAX_LIMIT`).

**Rationale**: Matches the spec's US1 / US5 promises; aligns with `002`'s cursor-pagination convention (`002`'s topic-papers endpoint uses cursor pagination too).

**Alternatives considered**:

- Offset pagination. Rejected — cursor matches `002`'s precedent and is more stable across concurrent writes.

---

## Decision 10: Bookmark interaction with topic deletion (Q4 resolution)

**Decision**: Bookmarks persist even when the source topic is deleted. The `Favorite` row stays. The favourites view (FR-022) renders a paper from a deleted-topic context the same as any other favourite — the `topic` field in the rendered row may be empty / "—" if no current topic of the user's references the paper, but the favourite itself is shown.

This means three states are possible for a row in the favourites view:

- Paper still attributed to ≥ 1 of the user's topics → render topic name(s) alongside the paper card.
- Paper not attributed to any of the user's topics, but `Paper` row still exists → render the paper card; topic column shows "—" or "(no current topic)".
- `Favorite.paperId` does not match any `Paper.id` (legacy favourites from `001` before this feature shipped) → render with the bare `paperId` and a "metadata unavailable" indicator; the row is otherwise navigable to whatever degree is possible.

The detail view (US2, FR-008) honours the same logic: an authenticated user can view a paper's detail if it is **either** in their current catalog **or** in their favourites. This is a deliberate widening: the spec's FR-009 says "a user attempting to view a paper not in their own catalog MUST receive a refusal," but Q4's resolution makes the favourite an explicit "this is mine" assertion that survives topic deletion. The repository helper that gates access is therefore "is the paper in the user's catalog **or** favourited by the user?", and the controllers / services honour that.

**Rationale**: This matches the user's explicit Q4=A choice. Bookmarks are deliberate saves; surfacing the paper detail for a bookmarked-but-no-longer-attributed paper is the consistent behaviour. The slight invariant cost (paper detail no longer means "in current catalog") is small compared to the alternative of silently pruning bookmarks on topic deletion.

**Alternatives considered**:

- Strict "catalog only" gate (Q4=B). Rejected by the user.
- Soft delete with grace period (Q4=C). Rejected by the user.

---

## Decision 11: Recommendation algorithm — metadata-based with weighted scoring

**Decision**: For a given paper P viewed by user U, the related-papers list is computed by scoring every paper in U's catalog (excluding P itself) and returning the top N. Score is a weighted sum:

```text
score(C; P) =
    w_topic    × | topics(P) ∩ topics_of_U(C) |
  + w_author   × | authors(P) ∩ authors(C) |
  + w_category × | categories(P) ∩ categories(C) |
  + w_lexical  × cosine_similarity(tfidf(title+abstract(P)), tfidf(title+abstract(C)))
  - w_age      × age_penalty(C)
```

Default weights (operator-configurable): `w_topic=3, w_author=2, w_category=1, w_lexical=2, w_age=0.5`. The lexical TF-IDF cosine is computed in-process over the user's catalog (small enough — hundreds of papers) on each detail-view request; no precomputed similarity table in v1.

`age_penalty` is a small monotonically-increasing-with-staleness factor so that all-else-equal, more recent related papers are preferred. The top `RECOMMENDATIONS_DEFAULT_LIMIT` (default 10, max 20 via `RECOMMENDATIONS_MAX_LIMIT`) results are returned.

**Rationale**:

- Metadata signals (shared topics, authors, categories) are cheap and explanatory — the user can see *why* something is recommended ("also in topic X", "by author Y"), which is good UX.
- Lexical similarity (TF-IDF cosine over title+abstract) handles the cross-vocabulary case where two papers share zero topics/authors but discuss the same idea.
- Computing inline on every detail-view request avoids the storage and freshness complexity of a precomputed similarity table. At hundreds of rows per user, inline is < 100 ms per request.
- All weights are env-overridable so the formula can be tuned without code changes.

**Alternatives considered**:

- AI embedding-based similarity (per FR-032 alternative). Rejected by the user (Q6 = A). Best upgrade path if metadata-based quality disappoints.
- Precomputed similarity table refreshed per cycle. Rejected — adds storage + freshness concerns; current scale makes inline computation sufficient.
- Pure topic-based recommendation (same topic only). Rejected — the user's spec asks for "related papers" beyond a single topic boundary; topic-shared papers are usually already visible in the per-topic view.

---

## Decision 12: Lexical similarity implementation — in-process TF-IDF

**Decision**: Implement TF-IDF cosine similarity in TypeScript inside `recommendations.service.ts`. Use a simple bag-of-words over lowercased title + abstract, tokenised on whitespace and stripped of a small built-in stop-word list. Inverse document frequency is computed over the user's catalog at request time (≤ hundreds of rows; fast enough).

No external NLP library (no `natural`, no `compromise`); the formula is ~50 lines of TypeScript and easier to debug.

**Rationale**:

- The implementation footprint is small, dependency-free, and easy to step through with a debugger.
- The IDF being scoped to the user's catalog is the right behaviour for recommendations — "common across this user's catalog" is the relevant baseline, not "common across the whole corpus."
- Quality is sufficient for SC-008 (70% top-5 plausibility) when combined with the metadata signals from Decision 11.

**Alternatives considered**:

- `natural` library's TF-IDF. Rejected — full library brings 50+ KB of code we don't need.
- BM25. Rejected — marginal quality gain at our scale; TF-IDF cosine is the well-known baseline.

---

## Decision 13: Bullet-summary backfill for existing papers

**Decision**: Ship a one-off backfill script `backend/scripts/backfill-summaries.ts` that iterates all papers without a `PaperSummary` row and calls `summaries.service.summarizeIfMissing` for each, respecting the same per-cycle cap and rate behaviour as a normal cycle. The script is **not** auto-run on deploy; an operator runs it manually after rollout to fill the catalog (`002` left ~hundreds of papers in dev; production may have more). Without the backfill, existing papers will not get summaries until they are re-attributed to a new topic (which usually doesn't happen for papers already in the catalog).

**Rationale**: Avoids implicit at-deploy work (which can exhaust the Gemini free-tier quota or rack up paid spend without warning). An operator decision to run the backfill is the explicit "we want to summarise the existing catalog" signal.

**Alternatives considered**:

- Run automatically on server startup. Rejected — uncontrolled spend on deploy is a bad operational property.
- Skip backfill entirely. Rejected — leaves a poor UX for the existing catalog.

---

## Decision 14: Per-user scope enforcement — repository layer, not controller

**Decision**: Every repository method that reads paper or summary data takes `userId` as a mandatory parameter and either filters by it directly or joins through `TopicPaperMatch` (or `Favorite` for the widened access in Decision 10). Controllers never call repositories that don't enforce ownership. Services that mutate `Favorite` rows (`addForUser`, `removeForUser`) already filter by `userId` per `001`'s pattern.

For recommendations (FR-031), the candidate-paper pool is loaded from the user's catalog via `paper.repository.findCandidatesForRecs(userId, originPaperId)`. Cross-user candidates can never reach the scoring loop.

**Rationale**: Constitution Principle V says "raw internal errors, database errors, and provider errors MUST NOT be exposed to clients." Putting the scope filter at the repository layer means a stray controller bug cannot leak cross-user data — the underlying query simply returns an empty set.

**Alternatives considered**:

- Controller-layer ownership checks. Rejected — too easy to forget; one missed check leaks the privacy invariant.
- Prisma extensions / middleware. Rejected — magical action-at-a-distance; explicit `userId` arguments are easier to audit.

---

## Decision 15: Testing posture — manual quickstart only

**Decision**: This iteration ships with a manual `quickstart.md` and no automated tests, matching `001` + `002`. A follow-up plan will introduce Vitest + Supertest before the hardening pass.

**Rationale**: Consistency with `001` + `002`. The user's standing "skip test-infra bootstrap" directive (recorded across both prior features) extends to this iteration. The Gemini integration is the most testable surface here; automating it would require recorded fixtures, which is a non-trivial side project.

**Alternatives considered**:

- Vitest + Supertest now, recording Gemini responses for replay. Rejected for consistency with prior features; planned as a dedicated follow-up.

---

## Decision 16: Frontend deferral

**Decision**: This feature ships backend only. No `src/app/search/*`, no `src/app/papers/*`, no React components, no API client in this iteration.

**Rationale**: Working agreement with the FE-reorg owner: backend ships first, FE integration follows separately. The REST contracts in `contracts/` are the handoff.

**Alternatives considered**: Ship a minimal FE alongside. Rejected to avoid stepping on the parallel FE reorg work, consistent with `002`.

---

## Open Questions / Future Iterations

None blocking v1. Items to revisit in a follow-up:

- AI embedding-based recommendations (Decision 11 / Q6 alternative) once metadata-based quality is observed in real use. Gemini also exposes an embeddings API (`text-embedding-004`) — would slot in behind `ai.service.ts` without disturbing the rest.
- Precomputed similarity table (Decision 11) if recommendation latency at scale becomes a constraint.
- Background queue for summarisation (Decision 4) if cycles outgrow a single process.
- External search engine (Decision 8) if `FULLTEXT` no longer suffices.
- Vitest + Supertest test infra (Decision 15) before the hardening pass.
- Summary regeneration UX (currently deferred by the spec) once an operator wants to refresh stale summaries after a Gemini model upgrade.
- Provider swap to OpenAI (or another) when paid access becomes available — would be a focused follow-up replacing `external/gemini.client.ts` with an equivalent client behind the unchanged `ai.service.ts` interface.
