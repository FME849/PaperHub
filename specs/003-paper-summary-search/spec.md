# Feature Specification: Paper Reading Experience (Search, Details, Summaries, Bookmarks, Recommendations)

**Feature Branch**: `003-paper-summary-search`
**Created**: 2026-05-22 (rewritten 2026-05-23)
**Status**: Draft
**Input**: User description (revised): "System summarizes abstract into concise bullet points. Users can: search papers, filter by topic, view paper details, bookmark favorite papers. System can recommend related papers."

> **Where this fits**: this feature is the user-facing payoff layered on top of `002-topic-subscription`'s populated paper catalog. The catalog already exists; users currently see freshly fetched papers per topic but cannot search, cannot see a paper detail page, have no AI-assisted summaries, cannot bookmark a specific catalog paper to a "saved" list, and have no way to discover related work. This feature delivers all five behaviours in one coherent reading experience. It corresponds to MVPs `#5` (AI summaries), `#7` (search / filter), `#8` (paper detail), plus a constitution-aligned recommendation slice.
>
> **Relationship to `001`'s favorites**: `001-user-auth` already ships a `Favorite` table keyed by `(userId, paperId: VARCHAR(64))`. This feature reuses that surface as the bookmark substrate: bookmarking a paper from search or detail view writes to (or reads from) the existing favourites table. No new bookmark concept is introduced.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Search across the user's fetched papers (Priority: P1)

An authenticated user with one or more tracked topics has accumulated some papers in their catalog. They enter a free-text query, see a ranked list of matching papers across **all of their topics**, and can click into any result.

**Why this priority**: Search is the highest single-feature unlock for a user whose per-topic view is becoming unwieldy. It is independently testable as soon as the catalog has a handful of papers; it does not depend on summarisation, details, bookmarks, or recommendations.

**Independent Test**: Log in as a user with at least one tracked topic that has fetched 20+ papers. Search for a term that appears in at least one paper's title or abstract. Verify: matching papers appear, ranked by relevance, each result shows title / authors / publication date / fetching topic(s); zero results expose other users' papers; an empty-state appears for queries with no matches.

**Acceptance Scenarios**:

1. **Given** an authenticated user whose tracked topics have fetched ≥ 1 paper containing the term `T` in title or abstract, **When** they search for `T`, **Then** the user sees at least one result, ranked by relevance, with each result showing title, authors, publication date, and the topic(s) that fetched it.
2. **Given** an authenticated user, **When** they search for a string that appears in no fetched paper in the user's catalog, **Then** they see a clear empty-state message rather than an error.
3. **Given** an authenticated user with papers across multiple topics, **When** they search for a term that matches papers in more than one of their topics, **Then** results include matches from each topic, each clearly indicating its fetching topic(s).
4. **Given** an authenticated user, **When** they search, **Then** they MUST NOT see any paper not fetched for one of their own tracked topics, even if it exists for another user.
5. **Given** an unauthenticated visitor, **When** they attempt to search, **Then** they are refused / redirected to login and no catalog data is disclosed.
6. **Given** results exceed one page, **When** the user paginates, **Then** they fetch the next page without re-running the query.

---

### User Story 2 - View paper details (Priority: P2)

An authenticated user has found a paper of interest (via search results or via their per-topic view from `002`) and wants more than the truncated card. They open the paper's detail view, which shows full title, full ordered author list, source-reported publication date, the full abstract, the canonical arXiv link, every topic of the user's that fetched the paper, and the bookmark / bookmark-removed control. When a summary exists (US3), it is shown alongside the abstract. When related papers exist (US6), they appear as a sidebar / list. The detail view is the destination for both search and per-topic-view interactions.

**Why this priority**: A useful catalog needs a place to land — search and per-topic views otherwise dead-end at a card with an external link. P2 because US1 (and the existing per-topic view from `002`) can deliver baseline value with inline detail; the detail view turns the catalog into a place to *read*, not just to leave to arXiv.

**Independent Test**: Log in as a user with at least one fetched paper. Click into the paper from either search results or the per-topic view. Verify: title, full abstract, full author list, publication date, arXiv link, and the user's own topics-that-fetched-it are all visible; the bookmark control reflects current state; clicking the arXiv link opens arXiv in a new tab; viewing a paper not in the user's catalog (by manipulating the URL) returns a clear refusal.

**Acceptance Scenarios**:

1. **Given** an authenticated user looking at a paper attributed to one of their topics, **When** they open the paper's detail view, **Then** they see title, full abstract, ordered author list, publication date, canonical arXiv link, and the set of the user's own topics that fetched this paper.
2. **Given** an authenticated user, **When** they attempt to open the detail view for a paper not in their own catalog, **Then** the system refuses (consistent with `002`'s per-topic-papers 404 behaviour) — no metadata is disclosed.
3. **Given** an authenticated user viewing a paper detail, **When** the paper has a stored summary (US3), **Then** the detail view shows the summary alongside the abstract; otherwise the user sees a clear "summary not yet available" indicator (US3 acceptance scenario 6).
4. **Given** an authenticated user viewing a paper detail, **When** related papers have been computed (US6), **Then** they appear in a "related papers" section; otherwise the section is hidden or shows "no related papers found."
5. **Given** an authenticated user viewing a paper detail, **When** they click the bookmark control, **Then** the paper's bookmark state toggles (US4) and persists across page reloads.

---

### User Story 3 - Newly fetched papers are summarized into concise bullet points automatically (Priority: P2)

The system, not the user, drives summarisation. When the existing `002` ingestion pipeline persists a newly attributed paper with a non-empty abstract, the system additionally generates a **short bullet-point summary** (3–5 bullets, each one phrase or short sentence) from the abstract using an external AI service, and stores it alongside the paper. Each paper is summarised **exactly once across the whole system**, shared across all users with access to that paper. By the time any user opens the paper, the summary is already there — no "Summarize" button, no spinner while the AI runs.

**Why this priority**: Summaries are a major qualitative upgrade for triage but they require an AI integration that does not exist today and a job pipeline; search (US1) and details (US2) deliver visible value first. P2 because it is independently testable on top of US1/US2 and `002`.

**Independent Test**: Trigger one `002` ingestion cycle so a new paper is fetched. Wait for the system's summarisation step to complete. Open the paper's detail view. Verify: (a) a bullet-point summary is present (3–5 short bullets, not prose), distinct from the abstract; (b) re-opening the paper still shows the same bullets (no second AI call); (c) a different user whose topic later fetches the same paper sees the same bullets (one summary per paper); (d) when the AI service is forced to fail, the paper still appears with abstract intact, the summary section indicates "summary not yet available," and the system retries the missing summary on the next opportunity.

**Acceptance Scenarios**:

1. **Given** the ingestion pipeline has persisted a newly attributed paper with a non-empty abstract, **When** the system's summarisation step runs, **Then** the system generates a bullet-point summary (3–5 bullets) from the abstract using the configured AI service and stores it against the paper.
2. **Given** a paper already has a stored summary, **When** a subsequent ingestion cycle attributes the same paper to another topic (same user or different user), **Then** the system MUST NOT re-summarise the paper — exactly one summary exists per paper across the whole system.
3. **Given** the AI service is temporarily unavailable when summarisation runs, **When** the system attempts to generate, **Then** the paper is persisted with abstract and metadata as usual, the missing summary is recorded as "pending retry," and the user still sees the paper in search and per-topic views — only the summary slot shows "summary not yet available."
4. **Given** a paper has been ingested but had no summary on first attempt, **When** the next scheduled summarisation opportunity arrives (next ingestion cycle), **Then** the system retries automatically without user action; on success, all users with access see the bullets on their next view.
5. **Given** a paper has an empty / missing abstract or one too short to summarise, **When** the summarisation step considers it, **Then** the system marks it `not_summarisable`, does NOT call the AI service, and the detail view shows "no summary available."
6. **Given** an authenticated user opens a paper that has been ingested but does not yet have a summary, **When** they view the paper, **Then** they see the abstract and metadata plus a clear "summary not yet available" indicator — never a half-generated summary or generic error.
7. **Given** an ingestion cycle attributes more papers than the operator-configured summarisation budget for that cycle, **When** the summarisation step runs, **Then** the system summarises up to the budget and queues the remainder for the next opportunity — no paper is permanently skipped.

---

### User Story 4 - Bookmark favourite papers (Priority: P2)

An authenticated user has found a paper they want to save for later. From either the search result row or the paper's detail view, they click a bookmark control. The paper is added to their personal favourites list. They can later browse all of their bookmarked papers in one place (the "favourites" view) regardless of which tracked topic originally fetched it, and they can unbookmark from the same control. Bookmarks persist across sessions.

**Why this priority**: Bookmarking adds a personal-curation layer on top of the catalog. It is independently testable once US1 exists (you can bookmark a search result) or once US2 exists (you can bookmark from a detail view). It is layered with US2 because the detail view is the natural place to bookmark.

**Independent Test**: Log in. From any of: a search result, a per-topic-view card, a detail view — click "Bookmark." Verify the paper appears in the user's favourites list. Refresh / log out / log in. Verify the bookmark persists. Click "Unbookmark." Verify the paper disappears from favourites. Verify another user's identical query never sees this user's bookmarks.

**Acceptance Scenarios**:

1. **Given** an authenticated user looking at one of their catalog papers (in search, per-topic view, or detail view), **When** they click the bookmark control, **Then** the paper is added to their favourites (or removed if already bookmarked) and the control reflects the new state immediately.
2. **Given** an authenticated user with one or more bookmarked papers, **When** they open the "favourites" view, **Then** they see every paper they have bookmarked, regardless of which tracked topic fetched it, in reverse-chronological order of when they bookmarked it.
3. **Given** an authenticated user attempts to bookmark a paper not in their own catalog, **When** the request is made, **Then** the system refuses and the favourites list is unchanged.
4. **Given** an authenticated user with a paper bookmarked, **When** all of the user's topics that previously fetched the paper are deleted (per `002` FR-006, the paper disappears from the user's searchable catalog), **Then** the bookmark MUST persist in the favourites view. The favourite is an explicit user save, independent of topic attribution — the favourites view remains the user's personal library even when the underlying topic membership has lapsed.
5. **Given** an unauthenticated visitor, **When** they attempt to bookmark or view the favourites list, **Then** they are refused / redirected to login.

---

### User Story 5 - Filter and refine search results (Priority: P3)

An authenticated user has run a search and gotten more results than they want to scan. They narrow with: restrict to one of their tracked topics; restrict to a publication-date range; restrict by author. Multiple filters combine with AND.

**Why this priority**: Filters multiply the value of search but are not required for search itself to be useful. P3 because US1 covers the headline interaction; filters are the natural follow-up once result sets get larger.

**Independent Test**: Run a search returning ≥ 10 results spanning ≥ 2 topics. Apply each filter independently and verify it narrows correctly. Combine filters and verify AND semantics. Clear filters and verify the original result set is restored without retyping the query.

**Acceptance Scenarios**:

1. **Given** an authenticated user with search results spanning multiple topics, **When** they apply a "topic" filter to one of their topics, **Then** only results fetched for that topic remain.
2. **Given** search results spanning a range of publication dates, **When** the user applies a date-range filter, **Then** only results in that range remain.
3. **Given** search results, **When** the user applies multiple filters at once, **Then** results matching ALL filters are returned (AND semantics).
4. **Given** filters applied, **When** the user clears them, **Then** the original unfiltered result set is restored without re-entering the query.

---

### User Story 6 - View related papers from a paper detail view (Priority: P3)

An authenticated user is reading a paper's detail view and wants to discover other papers the system thinks are related — same topic area, overlapping keywords, similar abstract content. The detail view (US2) shows a "related papers" section listing a small set of suggestions. Clicking a suggestion opens that paper's detail view (US2), enabling exploration.

**Why this priority**: Recommendations turn passive reading into discovery, but they layer on top of US2 (detail view) and require a similarity computation that does not exist today. P3 because the core read flow (US1 → US2 + US3) works without it; recommendations are the exploration layer on top.

**Independent Test**: Open a paper's detail view for a paper that has at least one plausibly-related paper in the user's catalog (same topic, overlapping abstract terms, shared author). Verify the "related papers" section shows at least one suggestion that is genuinely related (per a reasonable judgement) and excludes the originating paper itself. Click a suggestion → open its detail view → see its own related-paper list.

**Acceptance Scenarios**:

1. **Given** an authenticated user viewing a paper detail (US2), **When** the system can compute related papers from the user's catalog, **Then** the detail view shows a "related papers" section with up to a documented number of suggestions (e.g., 5–10).
2. **Given** an authenticated user, **When** the related-papers list is computed, **Then** every suggestion MUST itself be a paper attributed to one of the user's own tracked topics — recommendations are scoped to the user's own catalog; the system MUST never surface a paper from another user's catalog as a recommendation.
3. **Given** the originating paper is the only paper in the user's catalog, **When** the related-papers section is rendered, **Then** the user sees a clear "no related papers found" state — not an error.
4. **Given** an authenticated user clicks a suggested paper, **When** the navigation completes, **Then** the user is on that paper's own detail view (US2), with its own related papers and bookmark control.
5. **Given** the system's similarity computation is unavailable or has not yet been computed for the originating paper, **When** the user opens the detail view, **Then** the related-papers section indicates "related papers coming soon" or hides itself — the rest of the detail view still works.

---

### Edge Cases

- **Empty catalog**: a user with no tracked topics or no fetched papers searches → empty state directing them to create a topic first.
- **Stop-word query**: a query of only common stop words → treated as empty-state or "Try a more specific query"; never crashes or returns all papers.
- **Very long abstract**: an abstract exceeds the AI service's input limit → summarise a truncated version (noted internally) or mark `not_summarisable`; never crashes, never produces a half-bullet.
- **AI rate / cost limit reached in a cycle**: the cycle summarises up to the operator budget; remainder queue for next cycle. No permanent skip.
- **Concurrent ingestion attributing the same paper to two different topics**: one summary across the system; subsequent attributions do not retrigger AI work.
- **Process crash during summarisation**: the affected paper has no summary yet but exists in the catalog; retry behaviour covers it on the next ingestion cycle.
- **Topic deleted between search and view**: matches `002` FR-006 — a paper attributed only to the deleted topic immediately disappears from the user's searchable catalog.
- **Bookmark for a paper that later leaves the user's catalog** (all attributing topics deleted): see US4 scenario 4 — clarification pending.
- **Recommendation when the user's catalog is very small** (1–2 papers): the related-papers section may be empty for every paper the user views; the UI handles this state gracefully.
- **A paper recommends itself**: the originating paper MUST NOT appear in its own related-papers list.
- **AI service produces non-bullet output** (returns prose despite the prompt): the system MUST detect and either re-parse into bullets or fall back to displaying the raw text — never display malformed structure to the user.

## Requirements *(mandatory)*

### Functional Requirements

**Search (US1)**

- **FR-001**: Authenticated users MUST be able to submit a free-text query and receive a ranked list of papers from their own catalog (papers attributed to any tracked topic the user owns) whose title, abstract, or author list matches the query.
- **FR-002**: Search results MUST be ordered by relevance.
- **FR-003**: Each result MUST include title, ordered author list, publication date, canonical arXiv link, the set of the user's own topics that fetched it, and a bookmark indicator (bookmarked / not bookmarked).
- **FR-004**: Search MUST never return a paper that is not attributed to one of the requesting user's tracked topics, even if the paper exists for another user.
- **FR-005**: Results MUST be paginated with a documented page size; the user MUST be able to fetch the next page without re-running the query.
- **FR-006**: A query that matches no paper MUST return a clear empty-state response, not an error.
- **FR-007**: Search MUST require valid authentication.

**Paper Detail View (US2)**

- **FR-008**: Authenticated users MUST be able to view a paper detail view for any paper in their own catalog. The view MUST show: title, full abstract, ordered author list, publication date, canonical arXiv link, the user's own topics that fetched the paper, the bookmark control with current state, the bullet-point summary if one exists (FR-013), and the related-papers list if computed (FR-020).
- **FR-009**: A user attempting to view a paper not in their own catalog MUST receive a refusal; no metadata may be disclosed.

**Automatic Bullet-Point Summarisation (US3)**

- **FR-010**: The system MUST automatically generate a summary for each newly persisted paper with a non-empty abstract — without any user action and without exposing a user-triggered "Summarize" surface in v1.
- **FR-011**: Summarisation MUST be driven by paper persistence (i.e., as part of, or immediately after, an ingestion cycle's persistence step); the user never waits on the AI service interactively for a missing summary.
- **FR-012**: Summaries MUST be **bullet-pointed**: 3–5 short bullets per paper, each one phrase or short sentence. Prose-paragraph summaries are not the v1 format.
- **FR-013**: Each paper in the system MUST have at most one summary across all users and all topics — summaries are shared per paper.
- **FR-014**: A paper that already has a stored summary MUST NOT trigger a second AI call on subsequent attributions.
- **FR-015**: AI service failures MUST NOT prevent the paper from being persisted; the missing summary is recorded `pending_retry` and is retried automatically on the next ingestion opportunity.
- **FR-016**: A paper with no abstract, an empty abstract, or an abstract too short to summarise MUST be marked `not_summarisable`; the system MUST NOT call the AI service for it.
- **FR-017**: A paper whose abstract exceeds the AI service's input limit MUST be handled gracefully (truncate-and-summarise or mark `not_summarisable` — never crash or produce malformed output).
- **FR-018**: The system MUST cap how many AI summarisation calls it makes per ingestion cycle (operator-configurable). Reaching the cap MUST queue remaining papers for the next cycle without permanent loss.
- **FR-019**: When a user views a paper that does not yet have a summary, the system MUST clearly indicate "summary not yet available" — never display a half-generated, empty, or malformed summary.

**Bookmark / Favourite (US4)**

- **FR-020**: Authenticated users MUST be able to bookmark any paper in their own catalog from search results, the per-topic view, or the detail view.
- **FR-021**: Authenticated users MUST be able to unbookmark a previously bookmarked paper from any of the same surfaces.
- **FR-022**: Authenticated users MUST be able to view a "favourites" view listing every paper they have bookmarked, in reverse-chronological order of when they bookmarked it, regardless of which tracked topic fetched the paper.
- **FR-023**: A bookmark MUST be unique per `(user, paper)` — repeated bookmark attempts for the same pair MUST be idempotent.
- **FR-024**: A user MUST NOT be able to bookmark a paper not in their own catalog at the time the bookmark is created.
- **FR-025**: Bookmarks MUST be private to the bookmarking user.

**Filtering (US5)**

- **FR-026**: After running a search, the user MUST be able to narrow results by (a) one of their tracked topics, (b) a publication date range, (c) a specific author.
- **FR-027**: Multiple filters MUST combine with AND semantics.
- **FR-028**: Clearing filters MUST restore the unfiltered result set without re-entering the query.

**Related-Paper Recommendations (US6)**

- **FR-029**: When an authenticated user opens a paper's detail view, the system MUST present up to a documented number of related papers (e.g., 5–10) from the user's own catalog, ranked by an internal similarity measure.
- **FR-030**: A paper's related-papers list MUST NOT include the originating paper itself.
- **FR-031**: Related-papers recommendations MUST be scoped to the user's own catalog — only papers attributed (via `TopicPaperMatch`) to one of the requesting user's tracked topics may appear as a recommendation. The system MUST never surface a paper from another user's catalog as a related-paper suggestion, preserving the catalog-privacy invariant established by `002` FR-022.
- **FR-032**: The similarity computation MUST be based on paper metadata only: shared topics (papers fetched for the same tracked topic), shared authors, category overlap (the topic's source filters), and lexical similarity of titles and abstracts. AI-embedding-based similarity is explicitly out of scope for v1 — no additional AI service calls are made for recommendations beyond what summarisation (US3) already requires.
- **FR-033**: If the system cannot compute related papers for the originating paper (e.g., similarity not yet computed, user's catalog too small), the detail view MUST clearly indicate "no related papers found" or "related papers coming soon" — never crash or show a blank section without explanation.

**Cross-cutting**

- **FR-034**: The system MUST log summarisation activity (per-cycle counts: attempted, succeeded, failed, skipped-not-summarisable), search activity (per-user counters), bookmark activity (per-user counters), and recommendation requests (per-paper / per-user counters), at a granularity sufficient to diagnose cost, abuse, and persistent failures — without recording the search query text in any audit log a regular operator can read.

### Key Entities *(include if feature involves data)*

- **Paper Summary**: a persisted bullet-point summary for one paper. Key attributes: stable identifier; paper identifier (FK to `Paper` from `002`); bullets (ordered list of short strings); generation timestamp; model / version used; status (`succeeded` / `pending_retry` / `not_summarisable`). Uniquely identified per paper.
- **Favourite (referenced from `001`)**: the existing `Favorite` table (`(userId, paperId)`, unique). This feature does not redefine it; bookmarking is the act of inserting / deleting a row in this table. The `paperId` column references this feature's `Paper.id` (cuid) — the schema already supports this since `paperId` is `VARCHAR(64)`.
- **Paper Similarity (system-internal)**: for each paper, a small ordered list of "related paper" candidates with similarity scores, computed by the recommendation step. Refreshed periodically (e.g., on ingestion or on a separate schedule). System-internal; presented to the user only via FR-029.
- **Search Activity Log (system-internal)**: per-user counters of search and recommendation actions, supporting FR-034.
- **Summarisation Activity Log (system-internal)**: per-ingestion-cycle counters supporting FR-034 and operator diagnostics.
- **Paper, Tracked Topic, Topic-Paper Match, User** *(referenced, not owned by this feature)*: defined elsewhere. This feature reads them and writes its own dependent records; it does not modify their schemas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 95% of search queries against a user's catalog of up to 1,000 fetched papers return results within 2 seconds of perceived latency.
- **SC-002**: For a query whose terms appear in at least one paper in the user's catalog, the relevant paper appears in the top 5 results in at least 90% of acceptance trials.
- **SC-003**: Zero search, detail-view, bookmark, or recommendation responses expose data from another user's catalog across all acceptance trials.
- **SC-004**: At least 95% of papers newly persisted in an ingestion cycle have a stored bullet-point summary by the end of the next ingestion cycle, excluding papers marked `not_summarisable`.
- **SC-005**: Viewing a paper that already has a stored summary returns within 500 ms of perceived latency in at least 99% of trials (no second AI call).
- **SC-006**: Across at least 1,000 paper persistence events, the system makes at most 1 AI summarisation call per paper in total (shared-per-paper caching).
- **SC-007**: A user can complete the end-to-end task "search for a paper, open its detail view, read its bullet summary, bookmark it, and see the bookmark in their favourites" in under 30 seconds for a returning user familiar with the UI.
- **SC-008**: For a paper that has at least one plausibly-related paper in the user's catalog (per reasonable human judgement: same topic / shared authors / overlapping abstract terms), at least 1 genuinely related paper appears in the top 5 related-papers list in at least 70% of acceptance trials. (Recommendations are quality-graded, not exact-match.)
- **SC-009**: The system's AI service spend stays within the operator-configured per-cycle cap (FR-018) across all cycles; reaching the cap never causes permanent gaps.
- **SC-010**: Bookmarking and unbookmarking each persist in under 500 ms of perceived latency in at least 99% of trials and survive logout / login round-trips in 100% of trials.

## Assumptions

- **Catalog exists**: `002-topic-subscription` is shipped; the `Paper`, `TrackedTopic`, and `TopicPaperMatch` tables are populated. This feature reads them and writes its own dependent records (`PaperSummary`, similarity, etc.). It does not introduce new ingestion.
- **Google Gemini is the AI service** for summarisation in v1, per the constitution's "Default AI Provider Selection" guidance (constitution v2.1.0). The provider is operator-configurable via environment variables and may be swapped (e.g., to OpenAI) without code changes outside `external/` and the AI service wrapper. If recommendations later use AI (per FR-032 alternative), they use the same provider.
- **Search scope is the user's own catalog** — papers attributed (via `TopicPaperMatch`) to any of the user's currently-existing tracked topics. Other users' catalogs are never searched (matches `002` FR-022).
- **No full-text PDF search** — only metadata (title, abstract, authors) is searchable. PDFs remain out of scope.
- **Bullet summary format**: 3–5 bullets per paper, each one phrase or short sentence. Exact bullet wording and count tuning is implementation detail; the user-facing shape is bullets, not prose.
- **Summary sharing**: one summary per paper across the whole system (Q1 resolved in the prior iteration of this spec).
- **Catalog visibility on topic deletion**: matches `002`'s existing FR-006 (Q2 resolved in the prior iteration). Deleting a topic immediately removes its `TopicPaperMatch` rows; a paper attributed only to the deleted topic disappears from the user's searchable catalog.
- **Bookmarks reuse `001`'s `Favorite` table** (which is already `(userId, paperId: VARCHAR(64))`). `paperId` is interpreted as the catalog's `Paper.id` cuid value. No schema migration of `Favorite` is required.
- **Recommendations scope and method**: scoped to the user's own catalog (FR-031); similarity is metadata-based — shared topics, shared authors, category overlap, lexical similarity of title/abstract (FR-032). No AI embeddings in v1. If recommendations turn out to be too sparse or weak in real use, swapping to an embedding-based approach is a future iteration.
- **One-time backfill on rollout** (summaries): when this feature ships, existing papers in the catalog do not yet have summaries. The operator MAY run a one-time backfill to summarise the existing catalog. Whether the backfill ships in v1 is an operator deployment decision, not a precondition.
- **Per-cycle summarisation cap** is operator-configured; default value covers normal ingestion volume comfortably while preventing runaway cost.
- **No notifications** ("we found related papers!", "your summaries are ready") in v1.
- **The user-facing surface is a future iteration's frontend work** — this feature defines the user behaviours, the backend endpoints, and the data shape; the FE slice picks them up.
- **No cross-paper / comparative summaries** in v1; each summary is per-paper.
- **No live arXiv search** — search is local to PaperHub's catalog.
- **No citation-graph features** in v1; recommendations are similarity-based, not citation-based.
- **Summary regeneration is not exposed in v1** — once generated and stored, users always see the stored summary. Provider/model upgrade is an operator migration concern, not a user-level action.

## Clarifications

### Session 2026-05-23

- Q: Summary sharing across users → A: **Shared per-paper** — exactly one summary per paper across the whole system (FR-013).
- Q: Catalog visibility after topic deletion → A: **Matches `002`'s FR-006** — deleting a topic removes its attribution; paper disappears from the user's searchable catalog if no other topic of theirs references it.
- Q: Summarisation trigger → A: **Automatic, system-driven** — summarisation hooks into the ingestion path (FR-010 / FR-011). No user-triggered "Summarize" button in v1.
- Q: Bookmark persistence after the source topic is deleted → A: **Bookmark persists** — the favourite is an explicit user save, independent of catalog attribution. The favourites view remains the user's personal library even when the underlying topic has lapsed (US4 scenario 4).
- Q: Recommendation scope → A: **User's own catalog only** — only papers attributed to one of the requesting user's tracked topics may be recommended; the system never surfaces papers from another user's catalog (FR-031).
- Q: Recommendation method → A: **Metadata-based similarity** — shared topics, shared authors, category overlap, lexical similarity of title/abstract. No AI embeddings in v1 (FR-032).
