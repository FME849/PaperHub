# Feature Specification: Tracked Research Topics with Periodic Paper Fetch

**Feature Branch**: `002-topic-subscription`
**Created**: 2026-05-17
**Status**: Draft
**Input**: User description: "Users can create, edit, delete tracked research topics. Each topic contains: name, keywords, source filters. System periodically fetches papers based on these topics."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a Tracked Topic (Priority: P1)

An authenticated PaperHub user has an ongoing research interest (e.g., "diffusion models for protein folding") and wants the system to keep watch for new papers about it. They open a "New Topic" form, give it a name, enter one or more keywords that describe what to look for, choose source filters that scope where papers are pulled from, and save. The topic is added to their personal list of tracked topics and is immediately eligible for the next scheduled fetch cycle.

**Why this priority**: Creating a tracked topic is the entry point for the entire feature; without it, no edits, deletes, or fetched results exist. It is independently testable as soon as the form, persistence, and listing work — a user can declare an interest even before any fetched papers are visible.

**Independent Test**: Log in as a user with no tracked topics, open the "New Topic" form, fill in a name, at least one keyword, and at least one source filter, save, and confirm that the new topic appears in the user's tracked-topics list and survives a page refresh / re-login.

**Acceptance Scenarios**:

1. **Given** an authenticated user with no tracked topics, **When** they submit the "New Topic" form with a valid name, at least one non-empty keyword, and at least one source filter, **Then** the system creates the topic, attributes it to that user, confirms success, and shows the new topic in the user's tracked-topics list.
2. **Given** an authenticated user submitting the "New Topic" form, **When** they leave the name blank, provide no keywords, or provide no source filters, **Then** the system rejects the submission with clear, field-level error messages and persists no partial topic.
3. **Given** an authenticated user, **When** they submit a topic whose name duplicates one of their own existing topics (case-insensitive), **Then** the system rejects the submission with a clear message; duplicate names across different users MUST remain allowed.
4. **Given** an unauthenticated visitor, **When** they attempt to open the "New Topic" form or submit a topic, **Then** they are redirected to the login page and no topic is created against any account.
5. **Given** an authenticated user has reached the system limit on tracked topics per user, **When** they attempt to create another, **Then** the system rejects the attempt with a clear message stating the limit and the user's current count.

---

### User Story 2 - View, Edit, and Delete Tracked Topics (Priority: P2)

An authenticated user wants to audit and refine their tracked topics over time. They open a "My Topics" list, see all of their current topics with name, keywords, and source filters at a glance, and can drill into any topic to edit its name, keywords, or source filters. They can also delete a topic they no longer want; once deleted, the topic and any of its previously fetched paper attributions cease to appear in the user's tracked-topics views.

**Why this priority**: Once users can create topics (Story 1), they must be able to revise and remove them — both because keywords and source filters evolve as research questions sharpen, and because stale topics dilute the value of fetched results. It is independently testable as long as Story 1 is in place.

**Independent Test**: Log in as a user with at least one existing tracked topic, open the "My Topics" page, edit the topic's name and keywords, save, and confirm the changes persist. Then delete a topic and confirm it disappears from the list and from any per-topic views.

**Acceptance Scenarios**:

1. **Given** an authenticated user with one or more tracked topics, **When** they open the "My Topics" page, **Then** they see all and only their own topics, each showing at least the topic's name, the configured keywords, and the configured source filters.
2. **Given** an authenticated user with no tracked topics, **When** they open the "My Topics" page, **Then** they see an empty-state message that explains how to create a first topic.
3. **Given** an authenticated user editing one of their topics, **When** they change the name, keywords, or source filters and save, **Then** the system validates the changes, persists them, and the next fetch cycle uses the updated configuration; previously fetched papers for that topic remain attributed to the topic unless the user explicitly deletes the topic.
4. **Given** an authenticated user deleting one of their topics, **When** they confirm the deletion, **Then** the topic is removed from their tracked-topics list and from any per-topic views, and no further fetches are performed for it.
5. **Given** an authenticated user, **When** they attempt to view, edit, or delete a topic that belongs to another user (by manipulating the request), **Then** the system refuses and never discloses or modifies another user's topic.
6. **Given** an unauthenticated visitor, **When** they attempt to view, edit, or delete any topic directly, **Then** they are redirected to the login page and no topic data is disclosed or changed.

---

### User Story 3 - See Papers Fetched for a Tracked Topic (Priority: P3)

An authenticated user with at least one tracked topic wants the payoff: a list, per topic, of papers the system has fetched based on that topic's keywords and source filters. They open a topic detail view and see the papers most recently fetched for that topic in reverse chronological order, with enough metadata (title, authors, source, date) to decide whether to read or favorite each one.

**Why this priority**: The fetched-paper view is what turns tracked topics from a stored configuration into ongoing research value. It depends on Story 1 (a topic must exist) and is loosely coupled to Story 2 (edits to a topic affect future fetches but do not block the view). It can ship after P1 and P2 because the user can create and manage topics meaningfully even before this view exists.

**Independent Test**: Log in as a user with at least one tracked topic that has been through at least one fetch cycle, open the topic's detail view, and confirm that the user sees papers matching that topic's keywords and source filters, with the most recent papers shown first.

**Acceptance Scenarios**:

1. **Given** an authenticated user with a tracked topic that has been through at least one fetch cycle, **When** they open the topic detail view, **Then** they see the papers fetched for that topic in reverse chronological order by paper publication date.
2. **Given** an authenticated user with a tracked topic that has not yet been through a fetch cycle (e.g., the topic was just created), **When** they open the topic detail view, **Then** they see an empty state that explains the topic is queued for the next fetch cycle rather than an error.
3. **Given** an authenticated user with a topic whose fetched-paper set includes a paper that also matches another of the user's topics, **When** the user opens each topic's detail view, **Then** the paper appears in both topics' lists, clearly attributed in each.
4. **Given** an authenticated user, **When** they attempt to view fetched papers for a topic that does not belong to them, **Then** the system refuses and never discloses another user's fetched-paper list.

---

### User Story 4 - System Periodically Fetches Papers for Active Topics (Priority: P3)

The system itself, without user action, runs a fetch cycle at a fixed cadence: for each active tracked topic across all users, it queries the configured sources using the topic's keywords and source filters, attributes any newly discovered papers to that topic, and de-duplicates against papers it has already attributed to the same topic. Users do not directly trigger fetches; they only see the results.

**Why this priority**: This is the engine that makes Story 3 valuable, but it is a background behavior rather than a user-facing flow, so it is testable as a system behavior alongside Story 3. It is grouped at P3 with Story 3 because the two together deliver the fetched-paper experience.

**Independent Test**: Create a tracked topic with known keywords and source filters that are expected to match recent real-world results. Wait for (or trigger via operational tooling, out-of-band) one fetch cycle. Open the topic detail view and confirm matching papers appear. Re-run the fetch cycle and confirm no duplicate paper records appear for the same topic.

**Acceptance Scenarios**:

1. **Given** at least one user-owned tracked topic exists in the system, **When** the next scheduled fetch cycle runs, **Then** the system queries the configured sources for each active topic using its keywords and source filters and records any newly matched papers against that topic.
2. **Given** a paper that has already been attributed to a tracked topic in a prior fetch cycle, **When** a subsequent fetch cycle would attribute the same paper to the same topic again, **Then** the system MUST recognize the duplicate and MUST NOT create a second attribution.
3. **Given** a tracked topic the owning user just edited (e.g., changed keywords), **When** the next fetch cycle runs, **Then** the cycle uses the updated keywords and source filters.
4. **Given** a tracked topic the owning user just deleted, **When** the next fetch cycle runs, **Then** the cycle MUST NOT query for that topic and MUST NOT attribute any papers to it.
5. **Given** a source is temporarily unavailable when a fetch cycle runs, **When** the cycle attempts to query that source, **Then** the system MUST log the failure, MUST NOT corrupt prior fetched data for affected topics, and MUST retry that source on the next cycle.

---

### Edge Cases

- A user enters keywords containing punctuation, multi-word phrases, or non-ASCII characters — the system MUST accept and persist the keywords as entered, and the fetcher MUST apply them in a way consistent with each source's accepted query syntax (escaping or quoting as needed) without crashing the fetch cycle.
- A user supplies a source filter value that the system does not recognize (e.g., via a manipulated request) — the system MUST reject the create/edit with a clear error and MUST NOT persist an unrecognized filter.
- A fetch cycle returns a very large number of matching papers for one topic in a single run — the system MUST cap how many papers it attributes per topic per cycle so a single noisy topic cannot starve other topics or overwhelm the user's view; the cap and surplus-handling behavior MUST be specified by the implementation but MUST never result in data loss for already-attributed papers.
- A user's session expires while creating or editing a topic — the system MUST reject the action, communicate that the session has expired, and route them to re-authenticate without silently persisting partial changes.
- A user deletes a topic that is mid-fetch — the fetch cycle MUST either complete safely and discard its results for that topic, or abort cleanly; in neither case may a deleted topic end up with newly attributed papers.
- The user's account is deleted — all of that user's tracked topics and the Topic-Paper Match rows scoped to those topics MUST be removed in line with the privacy expectations established for account deletion; Paper records and other users' attributions are not affected.
- A paper has been attributed to multiple tracked topics belonging to different users (or to multiple topics belonging to the same user) — deleting any one of those topics MUST remove only that topic's own Topic-Paper Match row(s) for the paper. All other topics that referenced the same paper MUST continue to show the paper in their per-topic views, and the Paper record itself MUST remain in the catalog regardless of how many topics reference it (including zero).
- The system clock or scheduler misses a fetch cycle (e.g., process restart) — the next cycle MUST still pick up the work; missed cycles MUST NOT cause topics to be silently skipped indefinitely.

## Requirements *(mandatory)*

### Functional Requirements

**Tracked Topic Authoring (Create / Read / Update / Delete)**

- **FR-001**: Authenticated users MUST be able to create a tracked topic by providing a name, one or more keywords, and one or more source filters.
- **FR-002**: System MUST require each tracked topic to have a non-empty name, at least one keyword, and at least one source filter, and MUST reject create/edit submissions that violate these rules with clear, field-level errors and no partial persistence.
- **FR-003**: System MUST treat topic names as unique per user (case-insensitive) and MUST allow different users to use the same topic name independently.
- **FR-004**: Authenticated users MUST be able to view a list of their own tracked topics, each showing at least the topic's name, configured keywords, and configured source filters.
- **FR-005**: Authenticated users MUST be able to edit any of their own tracked topics' name, keywords, and source filters and have the changes persisted.
- **FR-006**: Authenticated users MUST be able to delete any of their own tracked topics. On deletion, the system MUST remove the Tracked Topic record and **only the Topic-Paper Match rows scoped to that specific topic**; the underlying Paper records MUST NOT be modified or deleted, and Topic-Paper Match rows belonging to other topics (whether owned by the same user or any other user) MUST be left intact. The deleted topic MUST NOT be queried in subsequent fetch cycles.
- **FR-007**: System MUST ensure tracked topics are private to the owning user: no user may read, edit, or delete another user's tracked topic, regardless of how the request is constructed.
- **FR-008**: System MUST require valid authentication for every create / read / update / delete action and reject unauthenticated requests with a clear, consistent error.

**Topic Configuration Data**

- **FR-009**: A tracked topic's keywords MUST be a non-empty, ordered list of free-text strings; the system MUST preserve user-entered casing and characters and MUST NOT impose case-sensitive matching constraints when querying sources.
- **FR-010**: A tracked topic's source filters MUST be drawn from a system-defined set of recognized sources and source-specific filter values (e.g., arXiv categories); the system MUST reject filter values it does not recognize at create/edit time.
- **FR-011**: System MUST enforce a documented upper bound on the number of tracked topics per user, the number of keywords per topic, and the number of source filters per topic, sufficient to prevent abuse without being restrictive for normal research workflows.

**Periodic Paper Fetch**

- **FR-012**: System MUST run a scheduled fetch cycle at a fixed cadence that, for every active tracked topic, queries the configured sources using the topic's keywords and source filters and records any newly matched papers against that topic.
- **FR-013**: System MUST de-duplicate fetched papers per topic so the same paper is never attributed to the same tracked topic more than once across fetch cycles.
- **FR-014**: System MUST handle source-side failures (timeouts, errors, rate limits) gracefully — failures on one source or one topic MUST NOT block other topics or sources in the same cycle, and the system MUST retry on the next cycle.
- **FR-015**: System MUST not query, fetch, or attribute papers for a tracked topic that has been deleted before or during a fetch cycle.
- **FR-016**: System MUST use the latest persisted configuration for each tracked topic at the start of each fetch cycle so user edits between cycles take effect on the very next cycle.
- **FR-017**: System MUST cap the number of newly attributed papers per topic per fetch cycle to a documented limit so a single noisy topic cannot starve other topics or overwhelm the user view; capping MUST not result in loss of papers already attributed in prior cycles.
- **FR-018**: Each fetch cycle MUST query each source only for papers newly published or newly indexed since the previous cycle's coverage window (incremental fetch); a cycle MUST NOT re-pull or re-attribute the historical corpus on every run.
- **FR-019**: A newly created tracked topic MUST NOT be backfilled with historical papers. The topic becomes eligible at creation time for the next scheduled fetch cycle, and from that cycle onward it accrues only papers within each cycle's incremental window. Users MUST see an explanatory empty state for any topic that has not yet been through a fetch cycle (see FR-023).

**Per-Topic Fetched Paper View**

- **FR-020**: Authenticated users MUST be able to open a per-topic view that shows the papers fetched for that topic.
- **FR-021**: The per-topic view MUST list papers in reverse chronological order by paper publication date by default and MUST display at minimum each paper's title, authors, source, and publication date.
- **FR-022**: A user MUST never see fetched-paper attributions for a topic that does not belong to them.
- **FR-023**: The per-topic view for a topic that has not yet been through a fetch cycle MUST show an explanatory empty state and MUST NOT return an error.

**Cross-Cutting**

- **FR-024**: System MUST log fetch-cycle-relevant events (cycle start/end, per-source success/failure counts, per-topic match counts) in a form suitable for diagnostics, without recording user-secret material.
- **FR-025**: When a user's account is deleted, the system MUST remove every Tracked Topic owned by that user and **only the Topic-Paper Match rows scoped to those topics**. Paper records MUST NOT be deleted, and Topic-Paper Match rows belonging to other users' topics (even for the same papers) MUST be left intact.

**Out of Scope for v1**

- **FR-026**: This feature does NOT send emails, push notifications, or digests when new papers are fetched in v1. Users see fetched papers by opening the per-topic view; any notification channel is a separate, follow-up feature.
- **FR-027**: This feature does NOT support sharing tracked topics between users in v1. Topics are private to their owner.

### Key Entities *(include if feature involves data)*

- **Tracked Topic**: A user-owned research watch. Key attributes: stable identifier, owning user identifier, human-readable name (unique per user, case-insensitive), ordered list of keywords (non-empty), set of source filters (non-empty, drawn from system-recognized values), status (active / deleted), created-at and updated-at timestamps. Many-to-one to User Account; one-to-many to Topic-Paper Match.
- **Source**: A system-defined catalog entry describing a paper source that the fetcher can query (e.g., arXiv) and the filter values that source accepts (e.g., arXiv category codes). Source identifiers are stable so users' configured filters remain valid across software upgrades. (The catalog itself is system-curated, not user-editable, and is referenced by Tracked Topic via source filters.)
- **Topic-Paper Match**: The attribution that a fetch cycle has discovered a specific paper for a specific tracked topic. Key attributes: tracked-topic identifier, paper identifier, fetched-at timestamp. Unique per (tracked-topic, paper) pair. Many-to-one to Tracked Topic; many-to-one to Paper.
- **Fetch Cycle (system-internal)**: An execution of the periodic fetcher. Key attributes: cycle identifier, started-at, finished-at, per-source success/failure counts, per-topic match counts. Internal to the system; not user-visible in v1 but exists for diagnostics and idempotency.
- **Paper (referenced, not owned by this feature)**: The paper entity defined elsewhere in PaperHub (paper-storage feature). This feature reads, stores attribution against, and displays papers but does not define their schema.
- **User Account (referenced, not owned by this feature)**: Defined by the user-authentication feature; tracked topics reference the authenticated user's identifier.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An authenticated user can create their first tracked topic (open form, fill name + keywords + source filters, save) in under 1 minute on a typical desktop browser.
- **SC-002**: 100% of valid create / edit / delete actions on a tracked topic are reflected in the user's "My Topics" view within 1 second of perceived latency, verified by acceptance testing.
- **SC-003**: 100% of edits to a tracked topic take effect on the next fetch cycle (i.e., the next cycle uses the new keywords and source filters), verified by acceptance testing across at least one cycle boundary.
- **SC-004**: Zero successful unauthorized accesses to another user's tracked topics or fetched-paper attributions in penetration/abuse testing covering common attack patterns (identifier manipulation, token replay, request forgery).
- **SC-005**: Across at least one calendar week of operation, 100% of scheduled fetch cycles complete (succeed or fail with logged diagnostics) without crashing the fetcher process; a single source's failure MUST NOT prevent other sources from being queried in the same cycle.
- **SC-006**: 0 duplicate Topic-Paper Match records exist for the same (tracked-topic, paper) pair across at least 10 consecutive fetch cycles in acceptance testing.
- **SC-007**: For a tracked topic whose keywords plausibly match recent real-world papers, the per-topic view shows at least one matched paper within one fetch cycle of the topic's creation in at least 80% of acceptance trials. (The remaining 20% accommodates legitimately quiet research areas.)
- **SC-008**: A user can find, edit, and save changes to one of their existing tracked topics in under 30 seconds on a typical desktop browser, including page load.
- **SC-009**: User-reported "false alert" rate on fetched papers (papers attributed to a topic but rated irrelevant by the topic's owner) remains at or below an agreed baseline (e.g., < 30% in a sample of subscribed papers) in post-launch evaluation.

## Assumptions

- Authenticated user identity is provided by the existing User Authentication feature (`specs/001-user-auth`); this feature consumes the authenticated user's identifier and authentication mechanism without redefining them.
- The paper catalog and the schema of a "paper" record are owned by a separate feature (paper-storage, MVP item #4). This feature stores attributions (Topic-Paper Match) against paper identifiers but does not define paper records. If the paper-storage feature ships after this one, the fetcher MAY persist papers into a minimal paper record itself; coordination with paper-storage is a planning concern, not a spec concern.
- In v1, the recognized source catalog is anchored to arXiv (matching the rest of the PaperHub product); source filters are arXiv-style category codes (e.g., `cs.AI`, `q-bio.BM`) and optionally a date-range constraint. Additional sources (PubMed, IEEE, Semantic Scholar, etc.) are explicitly out of scope for v1 but the data model MUST allow them to be added later without breaking existing topics.
- Notifications (email, push, digest) when new papers are fetched are out of scope for v1; users discover fetched papers by opening their per-topic view. A notification channel is a candidate follow-up feature.
- Keyword input is free-text only in v1. The system does not provide autocomplete, controlled-vocabulary suggestions, on-the-fly "best match" recommendations, or any restriction of keyword values beyond per-topic limits (FR-011) and routine validation (non-empty, reasonable length). A keyword-suggestion experience is a candidate follow-up feature.
- A newly created tracked topic is not backfilled with historical papers; it accrues papers only from the next fetch cycle onward, within each cycle's incremental window (see FR-018, FR-019). Users may therefore see an empty per-topic view between topic creation and the next cycle — this is by design, not an error.
- The fetch cadence in v1 is system-defined and operator-configurable (a single global cadence, e.g., once per day). Per-user or per-topic custom cadences are deferred.
- Tracked topics are private to their owning user; sharing, publishing, or collaborative editing of tracked topics is out of scope for v1.
- Per-user limits (max topics per user, max keywords per topic, max source filters per topic) are set by the implementation at values appropriate for research workflows; this spec does not fix specific numbers but requires that documented limits exist (FR-011).
- The system operates over HTTPS in all non-local environments, consistent with the rest of the platform.
- Data retention for tracked topics and Topic-Paper Match records follows the same policy as the rest of user profile data: retained while the account is active, removed on account deletion.
- This feature replaces the earlier interpretation of "Topic Subscription System" in this branch as administrator-curated topics with user subscriptions. The new interpretation is user-owned tracked topics with periodic fetch; the branch name `002-topic-subscription` is kept for continuity.
