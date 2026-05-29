# Feature Specification: Password Reset via Email

**Feature Branch**: `005-password-reset-email`
**Created**: 2026-05-28
**Status**: Draft
**Input**: User description (revised): "Users can reset their password securely through email when they forget their password. Requirements: request reset by email; system sends an email with a secure temporary token; token expires after a configurable duration; token is single-use; user sets a new password via the reset link; system validates the token before updating; invalid/expired tokens return proper errors; prevent email enumeration; rate-limit reset requests; log all reset events; email sending is asynchronous; failed sends support retry. Email: secure reset link to the frontend reset-password page, responsive HTML template, expiration notice. Security: passwords stay hashed; tokens cryptographically secure; tokens expose no user information; existing sessions invalidated after reset. Architecture: email logic isolated in email services."

> **Where this fits**: This feature closes a gap left open by `001-user-auth`: a user who forgets their password currently has **no self-service way back into their account** — the only recovery is out-of-band (manual operator intervention). This feature lets a user prove control of their registered email address and set a new password without ever knowing the old one. It builds on `001`'s account + password-strength rules and reuses the transactional email-sending capability introduced by `004-paper-email-notifications`.
>
> **Relationship to `001-user-auth`**: `001` already stores each user's email and a securely hashed password, and already enforces password-strength rules at registration and password-change time. This feature adds an *unauthenticated* recovery path that ends in the same "set a new password" operation `001` already performs — it does not change how passwords are stored or validated.
>
> **Relationship to `004-paper-email-notifications`**: `004` introduced a provider-agnostic transactional email capability (compose + send, isolated behind a backend service). This feature reuses that capability to deliver the reset link. It does **not** introduce a second email mechanism. Unlike `004`'s digests, reset emails are **transactional and unconditional** — they are not governed by the notification preference, because a locked-out user must be able to recover regardless of marketing/notification opt-in state.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Request a password reset link (Priority: P1)

A user who cannot log in because they forgot their password goes to a "Forgot password?" entry point, enters the email address associated with their account, and submits. If an account exists for that email, the system sends a password-reset email containing a time-limited, single-use link. Regardless of whether an account exists, the user sees the **same** neutral confirmation ("If an account exists for that address, we've sent a reset link"), so the feature never reveals whether a given email is registered.

**Why this priority**: Without the ability to request a link, no reset can begin. It is the entry point of the entire recovery flow and is independently testable: submit a known-registered email and confirm an email is delivered; submit an unknown email and confirm the same neutral response with no email sent.

**Independent Test**: From the "Forgot password?" page, submit the email of a known account and confirm exactly one reset email is delivered containing a working link. Submit an email with no account and confirm the identical on-screen confirmation appears and **no** email is sent. Submit a malformed email and confirm a field-level validation error.

**Acceptance Scenarios**:

1. **Given** a visitor on the "Forgot password?" page who enters the email of an existing account, **When** they submit, **Then** the system sends exactly one reset email to that address containing a time-limited, single-use reset link, and shows a neutral confirmation message.
2. **Given** a visitor who enters an email that matches no account, **When** they submit, **Then** the system sends **no** email and shows the **same** neutral confirmation message as scenario 1 (no account enumeration).
3. **Given** a visitor who enters a malformed email address, **When** they submit, **Then** the system rejects the input with a field-level validation error and sends no email.
4. **Given** a visitor who requests a reset link multiple times in quick succession for the same address, **When** they exceed the allowed request rate, **Then** the system throttles further requests (still showing the neutral confirmation) and does not send an unbounded number of emails.
5. **Given** an existing account that requests a new reset link while a prior reset link for the same account is still valid, **When** the new link is issued, **Then** the previously issued link is invalidated so that at most the most recent link works.
6. **Given** a visitor who submits the "Forgot password?" form, **When** they submit, **Then** the neutral confirmation is returned promptly without waiting for the email to be sent (sending happens asynchronously); a temporary email-provider problem does not delay or change the on-screen response.

---

### User Story 2 - Set a new password using the emailed link (Priority: P1)

A user who received the reset email clicks the link, lands on a "Set a new password" page, enters a new password (meeting the same strength rules as `001`), confirms it, and submits. The system validates the link, accepts the new password, confirms success, and the user can immediately log in with the new password. The link cannot be reused.

**Why this priority**: This is the payoff of the feature — the actual password change. It depends on US1 (a link must exist) but is independently testable given a valid link: completing it restores account access. Without it, US1 delivers an email that goes nowhere.

**Independent Test**: Using a valid, unexpired reset link from US1, open the "Set a new password" page, submit a new strength-compliant password, confirm success, then log in with the new password. Re-open the same link and confirm it is now rejected as already used. Open an expired link and confirm it is rejected with guidance to request a new one.

**Acceptance Scenarios**:

1. **Given** a user with a valid, unexpired, unused reset link, **When** they submit a new password that meets the strength rules, **Then** the system updates the account password, confirms success, and invalidates the reset link so it cannot be reused.
2. **Given** a user who successfully reset their password, **When** they attempt to log in with the new password, **Then** authentication succeeds; **and when** they attempt to log in with the old password, **Then** authentication fails.
3. **Given** a user who already used a reset link successfully, **When** they open the same link again, **Then** the system rejects it as invalid/used and directs them to request a new reset.
4. **Given** a user who opens a reset link after it has expired, **When** they attempt to set a new password, **Then** the system rejects the attempt and directs them to request a new reset.
5. **Given** a user on the "Set a new password" page, **When** they submit a new password that fails the strength rules or whose confirmation does not match, **Then** the system rejects the submission with a field-level error and the link remains valid for another attempt.
6. **Given** a user who opens a tampered or non-existent reset link, **When** they attempt to set a new password, **Then** the system rejects it with a generic invalid-link message that does not disclose whether the underlying account exists.

---

### User Story 3 - Recovery security and session safety (Priority: P2)

The reset flow is hardened so it cannot be abused to enumerate accounts, brute-force links, or leave stale access open. Reset links expire after a bounded lifetime, are single-use, are invalidated when a newer link is issued or when the password is changed by any means, and a successful reset terminates other active sessions so a thief who knew the old password is locked out. Requests are rate-limited per email and per origin.

**Why this priority**: P2 because US1 + US2 deliver a working reset, but the feature is not safely launchable without these controls — a reset flow is a prime target for abuse. The controls are testable on top of US1/US2.

**Independent Test**: Verify a link expires after the configured lifetime; verify issuing a second link invalidates the first; verify that changing the password (via this flow or via `001`'s authenticated change-password) invalidates any outstanding reset links; verify that after a reset, sessions established before the reset can no longer access protected pages; verify repeated requests are throttled.

**Acceptance Scenarios**:

1. **Given** a reset link, **When** the configured link lifetime elapses, **Then** the link is no longer accepted and the user is told to request a new one.
2. **Given** an account with an outstanding reset link, **When** the user changes their password through `001`'s authenticated change-password flow, **Then** the outstanding reset link is invalidated.
3. **Given** a user who completes a password reset, **When** the reset succeeds, **Then** sessions/credentials established before the reset are invalidated, requiring re-login on other devices.
4. **Given** repeated reset requests from the same origin or for the same address beyond the configured threshold, **When** the threshold is exceeded, **Then** the system throttles additional requests within the window and records the throttling for operational visibility.
5. **Given** repeated attempts to submit different guessed reset links, **When** the attempts exceed a threshold, **Then** the system throttles link-submission attempts to make brute-forcing infeasible.
6. **Given** any reset email, **When** it is delivered, **Then** it contains no password, no password hash, and no other user's data, and the link is the only sensitive element.

---

### Edge Cases

- **Deactivated or deleted account requests a reset**: the system behaves identically to the unknown-email case (neutral confirmation, no usable link issued), so account state is not disclosed.
- **Reset link clicked on a different device/browser than where it was requested**: the link works regardless of device — it carries its own proof and is not tied to the requesting session.
- **User requests reset, then remembers their password and logs in normally**: outstanding reset links remain valid until they expire or are superseded; logging in does not by itself invalidate a pending link unless the password is changed.
- **Reset link forwarded to another person**: whoever holds a valid, unexpired, unused link can set the password (this is inherent to email-based reset); the bounded lifetime, single-use, and session-invalidation controls limit the blast radius. The neutral pages never reveal the account holder's identity.
- **Email delivery fails (provider outage, hard bounce)**: the on-screen confirmation is still neutral and returns immediately (sending is asynchronous); the failed send is retried a bounded number of times and logged operationally; the user may also re-request (subject to rate limits). A failed send must not crash the request path or the async worker.
- **New password identical to the old password**: accepted unless `001`'s strength/policy rules forbid it; the spec does not add a new "must differ" rule beyond whatever `001` already enforces.
- **Multiple valid links issued before US1 scenario 5 invalidation takes effect**: at most the most recently issued link is valid; all earlier links for the same account are rejected.
- **Clock skew / link used right at expiry boundary**: the system treats the link as expired once the lifetime has elapsed; boundary behavior favors rejecting a just-expired link over accepting it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide an unauthenticated way for a user to request a password reset by submitting the email address associated with their account.
- **FR-002**: When a reset is requested for an email that matches an existing account, the system MUST send exactly one password-reset email to that address containing a single-use, time-limited reset link.
- **FR-003**: When a reset is requested for an email that matches no account (or a deactivated/deleted account), the system MUST NOT send an email and MUST return the **same** neutral confirmation as the matched case (no account enumeration via response content or timing).
- **FR-004**: The system MUST validate the submitted email format before processing and MUST reject malformed input with a field-level error without sending any email.
- **FR-005**: The reset link MUST be backed by a **cryptographically secure** token that is unguessable, single-use, and tied to exactly one account; submitting it MUST allow setting a new password for only that account. The token MUST be validated before any password update is permitted.
- **FR-006**: The reset link MUST expire after a bounded lifetime (default: 60 minutes); after expiry the system MUST reject it and instruct the user to request a new one.
- **FR-007**: Issuing a new reset link for an account MUST invalidate any previously issued, still-valid reset link for that account (at most one active link per account).
- **FR-008**: On successful reset, the system MUST update the account password using the **same** password-strength rules and secure storage that `001-user-auth` already enforces.
- **FR-009**: On successful reset, the system MUST invalidate the consumed reset link so it cannot be reused, and MUST reject any subsequent use of it with a generic invalid-link message.
- **FR-010**: On successful reset, the system MUST invalidate sessions/credentials established before the reset, so other active sessions must re-authenticate.
- **FR-011**: Changing the account password through any path (this flow or `001`'s authenticated change-password) MUST invalidate any outstanding reset links for that account.
- **FR-012**: The system MUST rate-limit reset requests per email address and per request origin within a configurable time window, and MUST continue to return the neutral confirmation when throttling.
- **FR-013**: The system MUST rate-limit reset-link submission/verification attempts to make brute-forcing a valid link infeasible.
- **FR-014**: All reset-flow responses (request, link verification, completion) MUST NOT disclose whether a given email is registered, beyond what is unavoidable, and MUST use generic messaging for invalid/expired/used links.
- **FR-015**: The reset token MUST NOT encode or expose any user information (no email, account id, name, or other PII derivable from the token); it MUST carry no meaning beyond being an opaque, verifiable secret. The token MUST be stored only in a non-reversible (hashed) form, never in plaintext at rest.
- **FR-016**: The reset email MUST NOT contain a password, a password hash, raw tokens for other users, or any other user's data; the reset link MUST be the only sensitive element and MUST NOT embed session credentials.
- **FR-017**: Reset emails MUST be transactional and unconditional — they MUST be sent regardless of the recipient's `004` notification preference or unsubscribe state.
- **FR-018**: Reset-email sending MUST be asynchronous — composition and delivery MUST run outside the synchronous request path, so the "Forgot password?" request returns the neutral confirmation without waiting on the email provider.
- **FR-019**: A failed reset-email send MUST support automatic retry with a bounded number of attempts; each failure MUST be logged with enough context to diagnose, MUST NOT expose provider errors to the user, and MUST NOT crash the request path or the async worker.
- **FR-020**: The reset email MUST be a responsive HTML message (rendering correctly on desktop and mobile clients) with a plain-text alternative, and MUST include a clear notice of when the reset link expires.
- **FR-021**: The reset link MUST point to the frontend "reset-password" page, carrying the token, so the user lands on a page where they can set a new password.
- **FR-022**: The system MUST record, for operational auditability, reset-request and reset-completion events (without storing the raw link or token), including timestamps and outcome (sent / suppressed-no-account / throttled / completed / send-failed / retry-exhausted).
- **FR-023**: All email-sending logic MUST be isolated in a dedicated email service/layer (no email-provider details leaking into request handlers or business logic), reusing the isolated transactional-email capability established by `004-paper-email-notifications`.

### Key Entities *(include if feature involves data)*

- **PasswordResetRequest**: Represents one issued reset capability for an account. Attributes: owning account, a non-reversible (hashed) representation of the single-use token (never the raw token in plaintext at rest), issued-at, expires-at, consumed-at (null until used), invalidated-at and reason (superseded / password-changed / used), and send-attempt bookkeeping (attempt count, last outcome) to support asynchronous send + bounded retry. At most one active (unexpired, unconsumed, non-invalidated) request per account.
- **PasswordResetAuditEvent**: Operational record of a reset-flow event. Attributes: owning account (if resolvable), event type (requested / suppressed-no-account / throttled / link-verified / completed / send-failed), origin metadata sufficient for rate-limit/abuse analysis, timestamp. Used for FR-018 and abuse investigation; contains no raw link and no password material.
- **User account (from `001-user-auth`)**: Reused, not redefined. Provides the email address (delivery target and lookup key), the password hash (updated on successful reset), and the session/credential surface that FR-010 invalidates.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user who has forgotten their password can regain access (request link → open email → set new password → log in) in under 5 minutes, end to end, without operator intervention.
- **SC-002**: For a registered email, ≥ 99% of reset requests result in a delivered reset email within 2 minutes of the request.
- **SC-003**: Across any audit window, the request response for a registered email and for an unregistered email are indistinguishable in content (and not separable by response timing beyond normal variance) — zero enumeration leaks.
- **SC-004**: 100% of reset links stop working after the first successful use and after the configured expiry, verified across a sample of completed and expired links.
- **SC-005**: After a successful reset, 100% of sessions established before the reset are required to re-authenticate.
- **SC-006**: Reset-request abuse is bounded: no single email address or origin can trigger more than the configured number of reset emails per window, verified by load-testing the throttle.
- **SC-007**: Zero reset emails contain a password, password hash, or another user's data over a 90-day audit window.
- **SC-008**: A user who submits an expired, used, or tampered link always receives clear guidance to request a new reset, with no account information disclosed, in 100% of such cases.
- **SC-009**: The "Forgot password?" request returns its confirmation in under 1 second regardless of email-provider latency, because sending is asynchronous (measured at the request boundary, independent of delivery time).
- **SC-010**: Reset emails render correctly (no broken layout, working link, visible expiration notice) across at least two common mail clients (one desktop, one mobile/webmail) in 100% of a 20-email inspection sample.
- **SC-011**: Transient email-send failures are recovered by retry: given a provider that fails then recovers within the retry window, ≥ 99% of reset emails for registered addresses are ultimately delivered without user re-request.

## Assumptions

- The account email recorded by `001-user-auth` is the canonical delivery target and lookup key; this feature does not introduce a separate recovery email or alternative recovery channels (no SMS, no security questions) in v1.
- The reset link directs the user to the frontend "reset-password" page, consistent with how `004` builds deep links into the application; the frontend page exchanges the token for the password-change operation. No new SSO or magic-login (passwordless sign-in) concept is introduced — the link only authorizes a password change, not a logged-in session.
- Asynchronous sending and bounded retry reuse the same offloading approach available to `004` (background processing isolated from the request path); the exact mechanism (queue / worker / scheduled retry) is an implementation choice deferred to `/speckit-plan`.
- The responsive HTML email reuses `004`'s handwritten HTML + plain-text rendering approach (a reset-specific template), not a new templating framework.
- Email-provider access stays isolated in the dedicated email service/layer introduced by `004` (Constitution Principle IV); this feature adds a reset-email template and a reset-send path, not a new provider integration.
- The reset-link lifetime defaults to 60 minutes and is operator-configurable; this is the industry-standard balance between usability and exposure.
- Reset emails reuse `004`'s transactional email capability and the same provider configuration; they are exempt from notification preferences because account recovery is not a marketing message (FR-016).
- Password-strength rules, hashing, and the underlying "set password" operation are owned by `001-user-auth` and are reused unchanged; this feature only adds the unauthenticated path that culminates in that operation.
- "Invalidate prior sessions" (FR-010) operates against whatever session/credential mechanism `001` uses; the exact mechanism is an implementation concern deferred to planning.
- Rate-limit thresholds and windows are operator-configurable with safe defaults; exact numbers are an implementation/ops concern, not a product requirement, beyond "bounded and effective."
- This feature is **out of scope** for: account lockout/unlock policies, multi-factor authentication, "magic link" passwordless login, recovery via phone/SMS, and admin-initiated password resets — each is a separate feature if desired.
