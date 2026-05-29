# Phase 0 Research: Email Notifications for Newly Fetched Papers

This document resolves every open technical question that would otherwise have appeared as `NEEDS CLARIFICATION` in the [plan.md](./plan.md) Technical Context. Each decision is recorded with rationale and rejected alternatives.

---

## Decision 1 — Email-send provider and SDK

**Decision**: Use **Nodemailer over SMTP** as the v1 default, accessed via a thin provider-agnostic interface in `external/email.client.ts`. Operators pick the concrete provider (Mailgun, Postmark, SendGrid, Amazon SES, Gmail SMTP, local Mailpit/MailHog for development, etc.) entirely by env vars (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_FROM_NAME`). No provider-specific dependency is added to `package.json`.

**v1 demo provider**: **Gmail SMTP** (`smtp.gmail.com:587`, STARTTLS) using a Google account's 16-character App Password. Chosen for the project demo because it costs nothing, requires no domain ownership, and delivers to a real inbox with one env-block change relative to the local Mailpit config. The ~500-sends-per-day Gmail limit is far above this feature's demo-scale fan-out. **Local development continues to use Mailpit** (no real send, instant preview UI); the Gmail config is the demo / "send to a real inbox" overlay.

**Rationale**:

- Mirrors the constitution's "operator-configurable through environment variables; provider swap stays inside `external/`" model already established for the AI provider (Principle IV).
- Nodemailer is the standard Node SMTP client; near-zero learning curve; well-typed; no vendor lock-in.
- Local development uses **Mailpit** (or MailHog) — a single binary that catches all SMTP traffic and exposes a web UI. The same `external/email.client.ts` code path runs in dev and prod; only the env vars change.
- A typed wrapper `EmailClient { send(payload: EmailSendPayload): Promise<EmailSendResult> }` isolates Nodemailer's surface area; swapping to a provider-specific HTTP SDK later (e.g., Postmark's `postmark` package) is a single-file change in `external/email.client.ts` with no service-layer churn.

**Alternatives considered and rejected**:

- **Resend SDK (`resend`)** — modern, ergonomic, free dev tier with bounce/complaint webhooks built in. Rejected for v1 because (a) it forces a single provider into the dependency graph and (b) the async-bounce upside is offset by the v1 simplification noted in Decision 3.
- **Postmark SDK (`postmark`)** — excellent deliverability and built-in suppression. Rejected for the same vendor-lock-in reason; reachable as an SMTP backend through Nodemailer.
- **Sending directly via `fetch` to a provider HTTP API** — saves a dependency, but every operator change becomes a code change. Rejected because the SMTP-via-Nodemailer path lets the operator switch providers with zero code edits.
- **AWS SDK (`@aws-sdk/client-ses`)** — heavy dependency (multi-MB), tightly coupled to AWS. Rejected for the same reasons as Resend/Postmark; SES is reachable over SMTP if an operator picks it.

---

## Decision 2 — Trigger: scheduler-tail vs. independent cron

**Decision**: **Trigger the notification job from the tail of `services/fetchCycle.service.ts`'s `run()`**, after summarisation completes. No new `node-cron` schedule is registered. The cron entry in `jobs/fetchCycle.job.ts` is unchanged.

**Rationale**:

- The spec is unambiguous: cadence is `002`'s fetch cycle, not a separate clock (FR-001). A second cron would introduce a second source of timing truth and require new "wait until cycle N is finished" coordination logic.
- `fetchCycle.service.ts` already owns the `cycleId` (it creates the `FetchCycle` row), already runs in the cron callback's async context, and already iterates topics. It is the only code path that knows when a cycle has reached a state where every paper's `TopicPaperMatch` row has been written. Calling `notificationsService.runForCycle(cycleId)` as its last step is the smallest, most direct expression of "per cycle".
- The HTTP request path is naturally untouched (no controller invokes the cycle); FR-013 (async) is satisfied for free.
- The existing scheduler shell's `if (running) skip` already protects against overlapping runs. The notification step runs inside that lock, so two cycles' digests can never interleave for the same user.

**Alternatives considered and rejected**:

- **Independent cron tick on a 24-hour schedule** — the prior spec revision proposed this; the user explicitly reverted it ("the email noti should come with the fetch cycle, not a fixed 24 hours"). Rejected per user direction.
- **A queue + worker** (BullMQ, Bee-Queue, or pg-boss) — would decouple send latency from the cycle and parallelise fan-out. Rejected for v1 because (a) Scale/Scope estimate is ~100 users worst case, well within a single Node process's serial send capacity in the SC-001 15-minute window, and (b) it would add a queue + worker process to the deploy topology, which the project does not yet have. Worth revisiting in v2 if user count grows past low thousands.
- **DB-as-queue using `DigestSendRecord` and a separate worker poll loop** — would partially decouple but still introduce a new process. Same rejection rationale.

---

## Decision 3 — Bounce / complaint tracking depth in v1

**Decision**: In v1, **only synchronous SMTP rejections** are captured in `EmailDeliveryFailure`. A truly asynchronous bounce (delivery report arriving hours later) is **out of scope** for v1 and will be a v2 webhook / IMAP-poll follow-up.

**Rationale**:

- A synchronous `550 No such user` or `553 Mailbox unavailable` returned during `Nodemailer.sendMail()` is enough to drive FR-016 (consecutive-bounce suppression) for the common "user typed their address wrong at signup" failure mode.
- A full async-bounce path requires: an inbound HTTP endpoint per provider with signature verification, a parser per provider's payload shape, a way to keep `UNSUBSCRIBE_TOKEN_SECRET` and provider webhook secrets distinct, and a re-sync rule when bounces arrive late. That is a sub-feature of comparable size to the entire current spec.
- SC-005 ("Hard-bounce suppression triggers within at most one fetch cycle of crossing the configured consecutive-bounce threshold") is satisfied for synchronous rejections, which is the predominant signal for the failure modes that matter at this scale.

**Documented as deviation** in plan.md Complexity Tracking. The deferral is recorded in this decision so a future v2 ticket can reopen it without re-tracing the reasoning.

**Alternatives considered and rejected**:

- **Provider-webhook path** (e.g., Postmark's `inbound/bounces` webhook) — best for production, vendor-coupled. Rejected for v1 size.
- **IMAP polling of a bounce mailbox** — provider-neutral but adds an IMAP client dependency and a second long-running loop. Rejected for v1 size.
- **Treating soft-bounces as hard-bounces after N retries** — over-aggressive; would suppress users for transient provider issues. Rejected.

---

## Decision 4 — Top-3 ranking rule

**Decision**: Among a user's candidate papers in a cycle, **rank by `Paper.publishedAt` descending**, ties broken by `TopicPaperMatch.fetchedAt` descending, then by `Paper.id` ascending (deterministic final tiebreak). Take the top 3.

**Rationale**:

- Most-recent publication is the strongest signal for "is this paper worth my time *right now*" without requiring a relevance score the system doesn't compute yet.
- `fetchedAt` is the second tiebreaker so that, in the unusual case of two papers with the same `publishedAt`, the more-recently-fetched one wins (slightly favouring the freshest detection).
- `Paper.id` (cuid) as the final tiebreak guarantees deterministic ordering — important for idempotent retries: a re-run of the same cycle's notification job MUST produce the same three papers (so `DigestSendRecord.includedPaperIds` doesn't drift).
- Matches the spec's documented assumption verbatim, with the deterministic tiebreak made explicit here.

**Alternatives considered and rejected**:

- **Relevance ranking via keyword overlap** (count of the topic's keywords appearing in the paper's title/abstract) — possible but introduces a tunable weight and a regression risk vs. simple chronology. Rejected for v1; revisit if user feedback says "the top 3 felt random."
- **Summary-quality ranking** (papers with a successfully-generated `PaperSummary` rank above those without) — would create a perverse incentive to delay sending until summaries land, undermining FR-004's "show placeholder, don't delay" rule. Rejected.
- **Random sample of 3** — easy but undermines reproducibility and idempotency. Rejected.

---

## Decision 5 — Email rendering: handwritten template vs. a framework

**Decision**: **Handwritten HTML + plain-text rendering** in `services/email-templates/digest.ts`, using template literals and a small set of explicit helpers for the per-paper block and the footer. No `mjml`, no `react-email`, no `handlebars`.

**Rationale**:

- The v1 email has one body shape with two render targets (HTML, plain text) and ~50 lines of structure total. A framework would add a dependency and a build step (or a new file extension to lint) for negligible gain at this size.
- Both renderers consume the same typed input shape `DigestPayload`, which the service layer constructs and validates. Drift between HTML and plain-text bodies is therefore prevented by typing, not by tooling.
- Hand-rolled HTML lets us be deliberately conservative: inline styles only (most clients strip `<style>` tags), table-based layout for Outlook compatibility, no remote images (v1 has no images), no JavaScript. This is exactly what email-best-practice guides recommend and what `mjml` would compile down to anyway.

**Alternatives considered and rejected**:

- **`react-email`** — pleasant DX, especially for FE devs. Rejected for v1 because it pulls React into the backend dependency graph, and the FE teammate doesn't own this iteration.
- **`mjml`** — produces robust email HTML but adds a compile step. Rejected for v1 size.
- **`handlebars` or `ejs`** — string templating, no DX gain over template literals in TS. Rejected.

---

## Decision 6 — Unsubscribe token shape and verification

**Decision**: The unsubscribe link's `token` query parameter is an **HMAC-SHA-256 of `userId` keyed by `UNSUBSCRIBE_TOKEN_SECRET`**, base64url-encoded, with a fixed version byte prefix (`v1:`) to allow future format migration. The unsubscribe endpoint (`GET /api/notifications/unsubscribe?token=…`) verifies the HMAC, looks up the user, flips `EmailNotificationPreference.enabled = false`, records `lastChangedVia = UNSUBSCRIBE_LINK`, and returns a no-login HTML confirmation page.

**Rationale**:

- HMAC over `userId` is unguessable, fixed-length, doesn't require a DB lookup to validate before identifying the user, and survives `EmailNotificationPreference` row recreation (so a user who deletes-and-recreates their preference still has working historical unsubscribe links).
- Keying by `UNSUBSCRIBE_TOKEN_SECRET` (a new env var) keeps the unsubscribe authority distinct from `JWT_SECRET` — leaking one does not leak the other.
- The `v1:` version prefix lets us migrate to a longer or rotated MAC scheme later (e.g., when adding rotation, we'd issue `v2:` tokens while still accepting `v1:` for a grace period).
- Repeat clicks (FR-012; spec edge case "clicked more than once") are idempotent: the endpoint always sets `enabled = false` and always returns the same confirmation page.
- Per FR-012 / spec edge case "clicked after the user re-enabled in settings", the unsubscribe always wins — the endpoint sets the flag to off unconditionally, then the user can re-enable from authenticated settings.

**Alternatives considered and rejected**:

- **A random DB-stored token per user** (e.g., `EmailNotificationPreference.unsubscribeToken`) — simpler MAC story but requires a DB write to issue a token and a DB read to verify; loses the "verifiable without prior DB lookup" property; risks invalidating outstanding links when the row is rewritten. Rejected.
- **A signed JWT** — over-engineered for a single boolean flip; payload would be mostly empty; reuses `JWT_SECRET` which entangles two security domains. Rejected.
- **A short-lived token** — would cause unsubscribe links in old emails to silently fail, a hostile UX for the exact scenario the link exists for. Rejected; unsubscribe tokens are intentionally long-lived.

---

## Decision summary

| # | Topic | Decision |
|---|-------|----------|
| 1 | Mail provider / SDK | Nodemailer over SMTP; provider chosen by env vars |
| 2 | Trigger mechanism | Tail call from `fetchCycle.service.run()`; no new cron |
| 3 | Bounce tracking | Synchronous SMTP rejections only in v1; async webhook deferred to v2 |
| 4 | Top-3 ranking | `publishedAt DESC`, then `fetchedAt DESC`, then `Paper.id ASC` |
| 5 | Email rendering | Handwritten HTML + plain text; no framework |
| 6 | Unsubscribe token | HMAC-SHA-256 of `userId` with `v1:` version prefix; long-lived |

All `NEEDS CLARIFICATION` items from the spec checklist's "open clarification candidates" section are resolved in this document. The plan moves to Phase 1 design with no unresolved unknowns.
