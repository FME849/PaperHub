# Quickstart: Email Notifications for Newly Fetched Papers

This is the manual walk-through that validates feature `004-paper-email-notifications` end-to-end on a developer laptop. It assumes `001`, `002`, and `003` are already up and working (see their respective `quickstart.md` files).

The walk-through uses a **local SMTP catcher** (Mailpit) so no real email is sent during development. Mailpit's web UI lets you inspect the rendered HTML, the plain-text alternative, the unsubscribe link, and the deep links into PaperHub.

---

## 1 — Prerequisites

- Node.js 20+ (same as `001`–`003`).
- MySQL 8.x reachable via the existing `DATABASE_URL`.
- `backend/` runs cleanly with `001` + `002` + `003`'s setup completed.
- A local SMTP catcher. **Mailpit** is recommended:

  ```sh
  # macOS (Homebrew)
  brew install axllent/apps/mailpit
  mailpit                                 # listens on SMTP :1025, web UI on http://localhost:8025
  ```

  Alternatively, **MailHog** works identically (SMTP `:1025`, UI `:8025`). Any other SMTP server that accepts unauthenticated localhost connections (including a real provider via the same env vars) is also fine.

---

## 2 — Install dependencies and migrate the database

```sh
cd backend
npm install                                # picks up nodemailer + @types/nodemailer additions
npx prisma migrate dev --name email_notifications
                                           # creates EmailNotificationPreference, DigestSendRecord,
                                           # EmailDeliveryFailure (migration 0004_email_notifications)
npx prisma generate                        # refresh the Prisma client types
```

If `prisma migrate dev` reports drift, see [data-model.md](./data-model.md) for the expected schema delta and rerun.

---

## 3 — Configure environment variables

Update your `backend/.env` (the file is gitignored; `.env.example` in the repo shows the new keys). All new variables for this feature:

```sh
# SMTP target — points at Mailpit by default for local dev.
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_SECURE=false                          # plaintext for local SMTP catchers
SMTP_USER=                                 # empty for Mailpit/MailHog
SMTP_PASS=                                 # empty for Mailpit/MailHog
EMAIL_FROM=no-reply@paperhub.local
EMAIL_FROM_NAME=PaperHub

# Where the FE lives — used to build the deep links in the email.
FRONTEND_BASE_URL=http://localhost:3000

# Unsubscribe-link signing secret. MUST be distinct from JWT_SECRET.
# Use a long, random string in production; any non-empty value is fine for local dev.
UNSUBSCRIBE_TOKEN_SECRET=dev-only-replace-me

# Per-cycle top-pick count for the email. 3 matches Reddit's daily highlight model.
DIGEST_TOP_PICKS_COUNT=3

# Hard-bounce suppression threshold. After this many consecutive HARD_BOUNCE rows
# for the same address since the last SENT digest, future digests are suppressed.
HARD_BOUNCE_THRESHOLD=3

# Master kill-switch for the notification job. Defaults to true; set to false to
# fully disable the feature without uninstalling the migration.
NOTIFICATIONS_ENABLED=true
```

Restart the backend (`npm run dev`) so the new config is picked up.

---

## 4 — Create a test user with topics that will match papers

If you don't already have a working user + topic from `002`'s quickstart:

```sh
# Register
curl -s -X POST http://localhost:4000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"tester@paperhub.local","password":"hunter2hunter2","displayName":"Tester"}'

# Login → capture token
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"tester@paperhub.local","password":"hunter2hunter2"}' | jq -r .token)

# Create a topic that should match recent arXiv content
curl -s -X POST http://localhost:4000/api/topics \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Diffusion models","keywords":["diffusion","generative"],"sourceFilters":["cs.LG"]}'
```

---

## 5 — Enable notifications for the test user

```sh
# Read the default (expect enabled:false)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/notifications/preference

# Opt in
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"enabled":true}' \
  http://localhost:4000/api/notifications/preference
```

Both responses use the contract in [contracts/notifications.md](./contracts/notifications.md).

---

## 6 — Trigger a fetch cycle (so the notification job runs at its tail)

There are two options:

**Option A — wait for the scheduled cycle.** `FETCH_CRON_EXPR` defaults to `0 3 * * *` (03:00 daily). Either wait, or temporarily set `FETCH_CRON_EXPR="* * * * *"` in `.env` and restart to fire one cycle per minute for testing.

**Option B — trigger via the existing operational script** (introduced for `002` operational use):

```sh
# From backend/, run the fetch cycle once and exit.
node --import tsx src/scripts/runFetchCycleOnce.ts
```

(If that script does not exist in your tree, copy the body of `fetchCycle.job.ts`'s cron callback into a one-shot invocation; the canonical operational tooling for triggering a cycle out-of-band is owned by `002`.)

Watch the backend logs. You should see, in this order:

```text
[scheduler] node-cron registered fetchCycle on "0 3 * * *"
[fetchCycle] starting cycle <cycleId>
[fetchCycle] ... topic stats ...
[fetchCycle] summaries: succeeded=N failed=0 skipped=0
[notifications] starting digest run for cycle <cycleId>
[notifications] user <userId>: 5 candidate papers; 3 picked
[notifications] user <userId>: SENT to no-reply@paperhub.local
[notifications] cycle <cycleId> complete: sent=1 suppressed_empty=0 suppressed_preference_off=0 failed=0
[fetchCycle] cycle <cycleId> finished
```

---

## 7 — Inspect the delivered email

Open Mailpit's web UI at `http://localhost:8025`. You should see one new email addressed to `tester@paperhub.local`. Verify (US1 + US3 acceptance scenarios):

- **Subject** contains the new-paper count, e.g., `PaperHub: 3 new papers in your topics` (FR-004 / SC-008).
- **From** shows `PaperHub <no-reply@paperhub.local>` (FR-011 / US3 AS5).
- **HTML body** lists exactly 3 papers (or fewer if the cycle attributed fewer than 3 for this user), each with title, author list, AI bullet summary (or a "summary not yet available" placeholder if `003` hadn't summarised the paper yet at compose time), and a paper-detail link of the form `${FRONTEND_BASE_URL}/papers/<paperId>`.
- A **"See more on PaperHub"** link is present at the bottom of the paper list with target `${FRONTEND_BASE_URL}/cycles/<cycleId>`. (The FE page that consumes this URL is owned by the FE teammate; the backend endpoint that backs it is `GET /api/notifications/cycles/<cycleId>/papers`, see [contracts/cycles.md](./contracts/cycles.md).)
- A **footer** carries an `Unsubscribe` link with target `http://localhost:4000/api/notifications/unsubscribe?token=v1:...` and the one-line "you are receiving this because..." statement.
- A **plain-text alternative** carries the same paper list and the same unsubscribe link (Mailpit's UI has a Source tab that shows both parts).

Open the paper-detail link → expect to land in PaperHub's paper detail surface from `003` (after login, if not already authenticated). Open the "See more" link → expect to see the FE cycle-papers page (when shipped by the FE teammate; until then, hit the backend endpoint directly with the JWT to verify the data).

---

## 8 — Verify the no-duplicate guarantee

Trigger the same fetch cycle artificially (re-run the operational script from step 6 with the previous `cycleId` somehow preserved — or, more simply: force the scheduler to re-process by clearing the in-process `running` flag).

Mailpit should show **no new email**. Backend logs should contain:

```text
[notifications] user <userId>: existing DigestSendRecord for cycle <cycleId> (outcome=SENT); skipping
```

You can also confirm in the database:

```sh
npx prisma studio                          # opens a web UI on http://localhost:5555
# Navigate to DigestSendRecord → one row keyed (userId, fetchCycleId) with outcome=SENT.
```

Run a **second**, fresh fetch cycle. Because the prior cycle's attributions are not "new", they will not appear in the second digest (FR-006 idempotency). If the second cycle attributes new papers, you'll get a second email with only those new papers.

---

## 9 — Test the "empty cycle" branch

Disable all topics for the test user (delete them via `DELETE /api/topics/:id`), then trigger a fetch cycle. The cycle will run but attribute zero papers to your user. Verify:

- **No email** is sent (FR-005 / US1 AS3).
- A `DigestSendRecord` row appears with `outcome = SUPPRESSED_EMPTY`.
- The backend log says `user <userId>: 0 candidate papers; suppressing (SUPPRESSED_EMPTY)`.

---

## 10 — Test the unsubscribe flow

Open the `Unsubscribe` link in the email you received in step 7 in a **fresh browser tab** (not logged in to PaperHub). Verify:

- You land on a small "You're unsubscribed" confirmation page.
- No `Set-Cookie` is written; no redirect to a logged-in surface.
- A subsequent fetch cycle for the same user produces **no email** (verify in Mailpit and in the backend log: `outcome = SUPPRESSED_PREFERENCE_OFF`).
- Visiting `/api/notifications/preference` while authenticated shows `{ "enabled": false, "lastChangedVia": "UNSUBSCRIBE_LINK" }`.
- Re-clicking the same unsubscribe link still returns the same `200` HTML; the preference is still `false`; no error (FR-012 idempotency).

---

## 11 — Test the synchronous-bounce path

Set the test user's email to a known-rejecting address in your SMTP catcher (Mailpit accepts everything by default — so for this test, point `SMTP_*` at a stricter server, or temporarily edit `external/email.client.ts` to throw a synthetic `550 No such user` on send). Then trigger a cycle and confirm:

- One `EmailDeliveryFailure` row with `failureClass = HARD_BOUNCE` and the captured SMTP response code.
- The matching `DigestSendRecord` has `outcome = FAILED_PERMANENT`.
- The backend log line is `user <userId>: SMTP failed (HARD_BOUNCE 550); recording failure and continuing`.
- The **server keeps running** (FR-014 / SC-007). Any other users in the same cycle still receive their digests.

Cause `HARD_BOUNCE_THRESHOLD` consecutive hard bounces. On the next cycle:

- The `DigestSendRecord` row has `outcome = SUPPRESSED_BOUNCE_QUARANTINE`.
- No SMTP call is made.
- The log line is `user <userId>: address in bounce quarantine; suppressing (SUPPRESSED_BOUNCE_QUARANTINE)`.

---

## 11.5 — Demo overlay: send through Gmail SMTP to a real inbox

For a project demo where the email needs to land in someone's real inbox (not just Mailpit's web UI), point the same `SMTP_*` env vars at Gmail. No code change.

### One-time Gmail setup (per Google account)

1. Open `https://myaccount.google.com/security`.
2. Enable **2-Step Verification** if it isn't already on. Google won't issue App Passwords without it.
3. Open `https://myaccount.google.com/apppasswords` (search "App passwords" if the direct link is missing on your account).
4. Create a new App Password named e.g. `PaperHub demo`. Google shows a 16-character password **once** — copy it now.

### Swap the env vars

In `backend/.env`:

```sh
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false                          # STARTTLS is upgraded on 587; do NOT set true
SMTP_USER=your.demo.account@gmail.com
SMTP_PASS=xxxxxxxxxxxxxxxx                 # the 16-char App Password (no spaces)
EMAIL_FROM=your.demo.account@gmail.com     # Gmail requires From to match SMTP_USER
EMAIL_FROM_NAME=PaperHub
```

Restart the backend (`npm run dev`). Trigger a fetch cycle (step 6). The email arrives in `your.demo.account@gmail.com`'s inbox (or whichever address your test PaperHub account uses — that one will receive the digest).

### Limits and demo notes

- Gmail caps free-account SMTP at **~500 messages / day**. Plenty for any demo; not for production.
- The `From` header must match `SMTP_USER`; Gmail rewrites or rejects mismatches. To send "from `no-reply@…`", you'd need a Google Workspace domain or a different provider.
- Recipients in Gmail may show the email as "via gmail.com" or land it in Promotions on first send — both are normal for unauthenticated personal Gmail.
- To revert to Mailpit, restore the local `SMTP_HOST=127.0.0.1 SMTP_PORT=1025` block; nothing else changes.

---

## 12 — Cleanup

```sh
# Stop the backend, then drop the test data:
npx prisma studio              # delete the test EmailNotificationPreference + DigestSendRecord rows
                               # OR
npx prisma migrate reset       # nukes the database; use only in a dev environment
```

Stop Mailpit (`Ctrl-C`).

---

## Reference

- Contracts: [contracts/notifications.md](./contracts/notifications.md), [contracts/cycles.md](./contracts/cycles.md)
- Data model: [data-model.md](./data-model.md)
- Research / decisions: [research.md](./research.md)
- Spec: [spec.md](./spec.md)
