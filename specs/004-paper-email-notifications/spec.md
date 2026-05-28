# Feature Specification: Email Notifications for Newly Fetched Papers

**Feature Branch**: `004-paper-email-notifications`
**Created**: 2026-05-26 (revised 2026-05-26)
**Status**: Draft
**Input**: User description (revised): "Users receive email notifications when newly fetched papers match topics they subscribed to. Notifications trigger only for newly inserted papers; users only see papers matching subscribed topics; duplicates must be prevented. Each email lists 3 papers (Reddit-style top picks) — not all — with paper title, short AI summary, authors, link to PaperHub, plus a 'see more' link. Users can enable or disable notifications. The system batches notifications **per fetch cycle from `002-topic-subscription`** (one digest per user per cycle, not on a fixed clock), processes asynchronously, and logs failed jobs without crashing the server."

> **Where this fits**: This feature is the asynchronous, off-platform companion to the in-app catalog delivered by `002-topic-subscription` and the reading experience added by `003-paper-summary-search`. Today, a user only learns that the periodic fetch cycle from `002` produced new papers by visiting PaperHub and opening each tracked topic. This feature pushes a Reddit-style highlight of each cycle's new matches to the user's inbox, with a "see more" link back into PaperHub for the long tail. It completes the loop: `subscribe to topic → fetch cycle runs → inbox highlight → read in PaperHub`.
>
> **Relationship to `002`'s fetch cycle**: `002` already runs the periodic fetch cycle that attributes newly matched papers to each user-owned tracked topic and de-duplicates against prior attributions. This feature **runs on each completed fetch cycle from `002`** — its cadence is exactly `002`'s cadence, not a separate clock. On each completed cycle, for each user, it considers only the paper-topic attributions newly created during that cycle. No new fetch path, paper source, or attribution rule is introduced.
>
> **Relationship to `003`'s AI summary**: `003-paper-summary-search` already produces a short AI-generated summary per paper. This feature reuses that stored summary as the per-paper teaser shown in the email; it does **not** introduce a new summarisation path.
>
> **Relationship to `001`'s user account**: `001-user-auth` already stores the user's verified email address. This feature reuses that address as the delivery target and adds a per-user notification preference on top of the existing account.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Receive a per-fetch-cycle top-3 digest of newly fetched papers (Priority: P1)

An authenticated user who has one or more tracked topics and has enabled email notifications receives, after each completed `002` fetch cycle in which at least one new paper was attributed to at least one of the user's tracked topics, a single digest email highlighting **up to 3 papers** newly fetched for that user in that cycle. The email is modelled on Reddit's daily highlight email: a small, scannable list of top picks rather than an exhaustive dump. Each paper entry shows the title, the ordered author list, a short AI-generated summary (from `003`), the matching tracked topic(s), and a link into PaperHub's paper detail view. A "See more on PaperHub" link at the bottom of the email takes the user to their in-app view of everything else fetched in the same cycle. The email is sent at most once per user per fetch cycle.

**Why this priority**: This is the entire point of the feature — without the per-cycle digest, no other story (preferences, opt-out, reliability) has anything to operate on. It is independently testable as soon as a "cycle completed" hook, a "newly attributed in this cycle" query, and a mail-send step are wired together. The MVP can ship with the preference toggled directly in the data store during early development, before US2's preference UI exists.

**Independent Test**: With email notifications enabled in the data store for the test user, ensure the user has at least one tracked topic that will match new papers in the next `002` fetch cycle. Wait for (or trigger) the next cycle to complete. Confirm: exactly one digest email is delivered to the user's verified address; the email lists at most 3 papers; each paper entry shows title, authors, AI summary, matching topic(s), and a working link to its PaperHub detail page; a "See more on PaperHub" link is present and points to the user's view of everything fetched in the same cycle; the email is **not** sent if no new papers were attributed to any of the user's topics in that cycle.

**Acceptance Scenarios**:

1. **Given** an opted-in user with one tracked topic, **When** a `002` fetch cycle completes and attributes ≥ 1 new paper to that topic, **Then** the user receives exactly one digest email for that cycle listing **up to 3** of those papers, each with title, ordered author list, short AI summary, matching topic, and a working link to its PaperHub detail page.
2. **Given** an opted-in user whose tracked topics had **more than 3** newly attributed papers in a single fetch cycle, **When** the cycle completes, **Then** the email lists exactly 3 papers (the top picks) and includes a "See more on PaperHub" link that takes the user to PaperHub's view of all papers fetched for that user in that cycle.
3. **Given** an opted-in user, **When** a fetch cycle completes and no new papers were attributed to any of the user's topics, **Then** no digest email is sent to that user for that cycle.
4. **Given** an opted-in user, **When** the same fetch cycle runs to completion and produces the same set of new papers, **Then** the user receives **at most one** digest email for that cycle, even if the cycle is internally retried or partially re-run (no duplicates).
5. **Given** an opted-in user with no AI summary yet computed for one of the top-3 candidate papers, **When** the email is composed, **Then** the paper still appears in the digest with a clear "summary not yet available" placeholder rather than an empty body or an error.
6. **Given** an opted-in user, **When** the email is composed, **Then** every paper listed MUST be one that has been attributed to one of that user's own tracked topics in this cycle; no paper attributed only to another user's topics may appear.
7. **Given** a deactivated or deleted account, **When** the next fetch cycle completes, **Then** no digest is generated or sent for that account, even if prior topics still have rows in the catalog.

---

### User Story 2 - Enable or disable email notifications (Priority: P2)

An authenticated user opens their account settings, sees an "Email notifications for new papers" preference (defaulting to **off** for both new and existing accounts), and can switch it on or off at any time. The preference takes effect from the next fetch cycle: turning it on opts the user into the next cycle's eligibility check; turning it off removes the user from all future cycles until re-enabled. Turning it back on after a period of being off does **not** retroactively email papers attributed while the preference was off.

**Why this priority**: P1 alone is fragile without user control — even an opted-in MVP needs a way for users to stop receiving mail. P2 because US1 can be demonstrated end-to-end before the preference UI exists, but the feature is not safely launchable without it.

**Independent Test**: Log in as a user with at least one tracked topic. Open account settings, confirm the email-notifications control is visible and defaults to off. Switch it on, save, and confirm the next fetch cycle produces a digest (per US1). Switch it back off, save, and confirm the following fetch cycle produces no digest for this user. Confirm the preference value persists across logout / login.

**Acceptance Scenarios**:

1. **Given** an authenticated user opening account settings who has never changed the preference, **When** they view the preferences page, **Then** the "Email notifications for new papers" control is visible and shows the default state (off).
2. **Given** an authenticated user toggling the preference on and saving, **When** the next fetch cycle attributes new papers to any of their tracked topics, **Then** they receive a digest (per US1).
3. **Given** an authenticated user toggling the preference off and saving, **When** subsequent fetch cycles run, **Then** the user receives no digest emails, regardless of how many new papers are attributed to their topics.
4. **Given** an authenticated user toggling the preference on after a period of being off, **When** the next fetch cycle runs, **Then** the digest contains only papers newly attributed in that cycle — papers fetched while the preference was off are **not** retroactively included.
5. **Given** an unauthenticated visitor, **When** they attempt to read or change another user's notification preference (e.g., by manipulating the request), **Then** the system refuses and never discloses or modifies the preference.

---

### User Story 3 - Email content quality, deep links, and unsubscribe footer (Priority: P3)

Each digest email is recognizable, scannable, and reliably deliverable. It has a PaperHub-branded "from" identity, a subject line that names the feature and the new-paper count (e.g., "PaperHub: 3 new papers in your topics"), well-formed HTML and plain-text bodies carrying the same content, working deep links into PaperHub's paper detail and "this cycle's papers" views, and a footer containing a one-click unsubscribe link (which flips the same preference exposed by US2) plus a one-line statement of why the user is receiving the email. The email does **not** include passwords, session tokens, or any data attributable to another user.

**Why this priority**: P3 — it is a quality, trust, and compliance slice on top of US1's delivery. The feature can ship with a plain message and US2's in-app toggle, but unpolished bulk email risks spam-folder placement, and a footer-level unsubscribe is required for compliant email practice (CAN-SPAM, GDPR-style easy opt-out). It is independently testable against a delivered digest using standard email-rendering, inbox-placement, and link-target inspection.

**Independent Test**: Trigger a digest (per US1). Inspect the delivered email in at least two common mail clients (one desktop, one mobile/webmail). Confirm: the "from" name and address are PaperHub-branded; the subject line contains the new-paper count and is non-empty for any sent digest; the HTML body renders without broken images, broken links, or layout overflow; the plain-text alternative is readable and contains the same paper list and the same unsubscribe link; clicking any per-paper deep link arrives at the corresponding paper detail page in PaperHub (subject to login); the unsubscribe link, when clicked in a fresh browser session, disables future digests for this user and confirms on a no-login landing page.

**Acceptance Scenarios**:

1. **Given** a digest about to be sent, **When** the email is composed, **Then** the subject line states the feature and the number of papers in the digest (e.g., "PaperHub: 3 new papers in your topics").
2. **Given** a digest about to be sent, **When** the email is composed, **Then** it includes both an HTML body and a plain-text alternative carrying the same paper list, AI summaries, "See more" link, and unsubscribe link.
3. **Given** a delivered digest, **When** the recipient clicks a paper's deep link, **Then** they land on that paper's detail page in PaperHub (after logging in if needed); links MUST NOT reveal session tokens, password material, or any other user's data.
4. **Given** a delivered digest, **When** the recipient clicks the "Unsubscribe" link in the footer, **Then** the user's notification preference is flipped to off (same preference as US2), the user lands on a confirmation page that does not require login, and the user receives no further digests starting from the next fetch cycle.
5. **Given** a delivered digest, **When** the recipient views the footer, **Then** the footer shows a PaperHub-branded "from" identity, a clearly labelled unsubscribe link, and a one-line statement of why the user is receiving the email.

---

### Edge Cases

- **A fetch cycle completes with no new attributions for a user**: No digest is sent for that user for that cycle (FR-005). The user is still considered eligible for the next cycle if their preference remains on.
- **A fetch cycle produces more than 3 new papers for one user**: The email lists exactly 3 (top picks); the "See more on PaperHub" link goes to the user's view of all papers fetched for them in this cycle. The user never sees an unbounded body.
- **AI summary missing for a candidate paper at digest-compose time**: The paper still appears with a "summary not yet available" placeholder (US1 acceptance scenario 5); selection of the 3 top picks is not blocked by missing summaries, and the digest is not delayed.
- **Fetch cycle completes but the notification job crashes mid-batch**: The server MUST NOT crash; the failure MUST be logged with enough context to retry (FR-013, FR-014). Users whose digest had already been recorded as sent for this cycle MUST NOT receive a duplicate when the batch is retried (FR-006, FR-015 idempotency).
- **Mail-sending dependency unavailable**: The send is retried within a bounded window. If retries exhaust, the failure is logged per recipient and the server keeps running; the affected cycle's papers are **not** silently rolled into the next cycle's email (no double-send), but the underlying attributions remain available via PaperHub's in-app view.
- **A fetch cycle is retried, partially re-run, or otherwise re-enters its "completed" state**: At most one digest per user per *logical* cycle is sent (FR-006, FR-015); a second "completed" signal for the same cycle MUST NOT produce a second digest.
- **Two fetch cycles complete close together** (e.g., a manual operational re-run): The notification job treats each cycle independently; each digest covers only its own cycle's new attributions, and the same paper attributed in cycle N MUST NOT also appear in a cycle N+1 digest (FR-006 — once per attribution per user).
- **User deletes a tracked topic between attribution and digest send**: The digest excludes papers attributed only to deleted topics; if all candidate papers came from deleted topics, no digest is sent for that cycle.
- **User deletes their account between attribution and digest send**: No digest is sent for that user; the account's pending digest material is discarded.
- **Address hard-bounces repeatedly**: After a small number of consecutive hard bounces (default: 3), the system suppresses further digests to that address and logs the suppression against the account, so deliverability for other PaperHub users is not harmed.
- **User toggles preference off after a fetch cycle completes but before their digest is sent**: The system MUST respect the latest preference state at send time — if the preference is off when the digest is composed, no digest is sent for that cycle.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The notification job MUST run once per completed `002` fetch cycle; its cadence is the fetch cycle's cadence, not a separate fixed clock. The job MUST NOT be triggered by user actions.
- **FR-002**: For each user with email notifications enabled, the notification job MUST identify the set of papers newly attributed to any of that user's tracked topics during this fetch cycle.
- **FR-003**: For each eligible user with ≥ 1 candidate paper in the cycle, the system MUST select **up to 3** of those papers as the digest's "top picks" and send exactly one digest email per cycle to the user's verified email address.
- **FR-004**: Each paper entry in the digest MUST include the paper's title, ordered author list, short AI-generated summary (sourced from `003-paper-summary-search`'s stored summary), the matching tracked topic(s), and a deep link to the paper's detail page in PaperHub. If the AI summary for a paper is not yet available, the entry MUST show a clear "summary not yet available" placeholder rather than omit the paper or fail the send.
- **FR-005**: The digest MUST include a single "See more on PaperHub" link pointing to PaperHub's view of all papers fetched for that user in this cycle; the digest MUST NOT be sent at all when the user's candidate set for the cycle is empty.
- **FR-006**: The system MUST prevent duplicate notifications: a given paper-topic attribution MUST appear in at most one digest per user across the lifetime of that user's notifications. Re-running the notification job for the same cycle (e.g., after a transient failure) MUST NOT re-send a digest already recorded as sent for that user / cycle, and MUST NOT re-include attributions already covered in a prior digest.
- **FR-007**: The system MUST send at most one digest per user per fetch cycle; user actions (toggling preference, opening the app, etc.) MUST NOT trigger an out-of-band digest send.
- **FR-008**: The system MUST enforce per-user isolation: a digest sent to user A MUST contain only papers attributed to user A's own tracked topics and MUST NOT disclose any other user's topics, papers, or identity.
- **FR-009**: The system MUST expose an "Email notifications for new papers" preference to each authenticated user via account settings; the preference defaults to **off** for both new and existing accounts.
- **FR-010**: Changes to the email-notifications preference MUST persist across sessions and MUST take effect from the next fetch cycle; the system MUST NOT retroactively email papers attributed while the preference was off.
- **FR-011**: The digest email MUST include both an HTML body and a plain-text alternative carrying the same paper list, AI summaries, "See more" link, and unsubscribe link.
- **FR-012**: The digest email MUST include a one-click unsubscribe link in the footer; clicking it MUST flip the recipient's notification preference (FR-009) to off without requiring a logged-in session, and MUST display a no-login confirmation page.
- **FR-013**: Notification processing MUST be asynchronous: composition and sending of digests MUST run outside any synchronous user-facing request path, and MUST NOT block the fetch cycle from returning. Users MUST NOT perceive notification latency in any in-app action.
- **FR-014**: Failed email send jobs MUST log the failure with enough context to diagnose (recipient account identifier, cycle identifier, error class, timestamp) and MUST NOT crash the application server or stop the notification job from processing the remaining users in the same cycle.
- **FR-015**: The system MUST record, for each user and each fetch cycle, whether a digest was attempted and the outcome (sent / suppressed-preference-off / suppressed-empty / suppressed-bounce-quarantine / failed-retryable / failed-permanent), and use this record to enforce FR-006 (no duplicates) and FR-007 (one per cycle).
- **FR-016**: The system MUST track delivery failures per recipient address; after a configured number of consecutive hard bounces (default: 3) the system MUST suppress further digests to that address and MUST log the suppression against the owning account.
- **FR-017**: The digest email MUST NOT include passwords, session tokens, raw API keys, or any data attributed to a different user; deep links MUST NOT carry session credentials.

### Key Entities *(include if feature involves data)*

- **EmailNotificationPreference**: Per-user setting indicating whether the user wants digest emails. Attributes: owning user, enabled (boolean, default false), last-changed-at, last-changed-via (settings UI / unsubscribe link). One per user.
- **DigestSendRecord**: A record of one attempt to send a digest to one user for one fetch cycle. Attributes: owning user, fetch-cycle identifier, included-paper identifiers (the up-to-3 top picks), candidate-paper count (total newly attributed in the cycle for this user; used to decide whether to show "See more"), recipient address at time of send, outcome (sent / suppressed-preference-off / suppressed-empty / suppressed-bounce-quarantine / failed-retryable / failed-permanent), timestamp. Used to enforce FR-006 (no duplicates) and FR-007 (one per cycle).
- **EmailDeliveryFailure**: A record of a delivery problem reported by the mail-sending dependency for a recipient address. Attributes: recipient address, owning user (if resolvable), failure class (hard bounce / soft bounce / spam complaint / other), reported-at. Aggregated to drive FR-016 (bounce quarantine).
- **Per-user "new attribution set for this cycle"**: A logical (not necessarily separately stored) view over the existing `002` attribution table that, for a given user and a given fetch cycle, yields exactly the paper-topic attributions created during that cycle for that user's owned topics. This is the read model the digest composer operates on; it does **not** introduce a new attribution entity if `002`'s attribution rows already carry cycle / created-at metadata.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For users opted in to email notifications, ≥ 99% of fetch cycles that produce ≥ 1 new attribution for that user result in exactly one digest email delivered to the user's verified inbox within 15 minutes of cycle completion.
- **SC-002**: Across any rolling 30-day window, the system sends **zero** digests for cycles in which the user had no new attributions.
- **SC-003**: Across any rolling 30-day window, **zero** paper-topic attributions appear in more than one digest to the same user (no duplicates, FR-006).
- **SC-004**: Users can change their notification preference end-to-end (open settings → toggle → save → see saved state on reload) in under 30 seconds, and the change is reflected in the next fetch cycle's digest decision.
- **SC-005**: When the cycle's candidate set for a user contains more than 3 papers, 100% of sent digests list exactly 3 papers and include a "See more on PaperHub" link to the user's view of all papers fetched for them in this cycle.
- **SC-006**: A user who clicks the unsubscribe link in a delivered digest receives **no further** digest emails starting from the next fetch cycle, measured across 100% of unsubscribe events.
- **SC-007**: When a single user's digest send fails (mail provider error, transient outage, etc.), the notification job for that cycle MUST continue processing the remaining users; ≥ 99% of users with non-empty candidate sets in the same cycle still receive their digest, and the application server experiences no crash or restart attributable to the failed job.
- **SC-008**: In random inspection of 20 delivered digests across at least two common mail clients, 100% render without broken images, broken links, or layout overflow; 100% have a working unsubscribe link; and 100% link each paper to its correct PaperHub detail page.
- **SC-009**: No cross-user data leakage incident is detected in any delivered digest over a 90-day audit window (each digest's body is verifiable, against the per-user attribution set, as containing only the recipient's own topics).
- **SC-010**: Hard-bounce suppression triggers within at most one fetch cycle of crossing the configured consecutive-bounce threshold; the suppressed account receives zero additional digests until the address is re-verified.

## Assumptions

- The verified email address recorded on each user's account by `001-user-auth` is the canonical delivery target; this feature does not introduce a separate "notification email" field.
- The default state of the notification preference is **off** for both newly created and pre-existing accounts; users must explicitly opt in. This is the industry-standard, deliverability-friendly default and avoids surprising existing users.
- The notification cadence is exactly the `002` fetch cycle cadence: one digest decision per user per completed cycle. The notification feature does **not** introduce its own scheduler or clock.
- The notification job is triggered by the completion of each `002` fetch cycle (in whatever form `002` already exposes that signal — completion hook, cycle-completed event, end-of-job callback, etc.). The exact triggering mechanism is an implementation choice deferred to `/speckit-plan`.
- The "top 3" selection ranks candidate papers by **most-recent paper publication date** within the cycle, with ties broken by most-recent attribution timestamp. This is the v1 ranking — a relevance-based or summary-quality-based ranking is a follow-up.
- The "See more on PaperHub" link points to PaperHub's view of all papers fetched for the user in this cycle. If no such per-cycle view exists yet in `002` / `003`, this feature must either add it or fall back to the user's per-topic listings filtered to the same window. Worth confirming before `/speckit-plan`.
- The short AI summary shown per paper is the same summary produced and stored by `003-paper-summary-search`. If the summary has not been computed yet at the time the digest is composed, the entry shows a "summary not yet available" placeholder — the digest is **not** delayed waiting for summaries.
- An external mail-sending dependency (transactional email provider) exists or will be provisioned; this feature does not specify which provider. The system depends on that provider for actual delivery, bounce reports, and complaint reports.
- The unsubscribe link uses a per-recipient, unguessable token tied to the user's preference; clicking the link is treated as the user's intent regardless of whether the click came from the recipient's mail client or was forwarded. Re-subscription is only possible via authenticated account settings (US2).
- Digest deep links into PaperHub direct the user to the paper detail page from `003-paper-summary-search`; if the user is not logged in when they click, the application's existing auth flow handles login and return-to-URL behavior. No new SSO or magic-link concept is introduced here.
- Notification work is offloaded to a background processor (queue / worker / async task — implementation choice deferred to `/speckit-plan`); composition and send are isolated from both user-facing request handling and the fetch cycle's critical path.
- This feature is **out of scope** for: per-topic email preferences (one global preference per user in v1), per-user custom cadences (cadence follows the fetch cycle in v1), aggregating multiple fetch cycles into a single digest (one digest per cycle in v1), localization of email content (English-only in v1), push / SMS / webhook channels (email-only in v1), and a relevance- or AI-driven ranker for the top-3 selection (most-recent in v1).
