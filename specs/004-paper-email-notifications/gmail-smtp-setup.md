# Gmail SMTP Setup (Demo / Real-Inbox Delivery)

**Audience**: operator or developer who wants digest emails to land in a real inbox (e.g. for a demo), instead of being caught locally by Mailpit.

**Why Gmail**: free, no domain ownership required, ~10-minute setup, delivers to a real inbox. The ~500-sends/day cap is far above this feature's demo-scale fan-out. For local development, prefer **Mailpit** (no real send, instant preview) — see `quickstart.md § 3`. Use Gmail only when you specifically need the email to arrive in an actual mailbox.

The backend is provider-agnostic (Nodemailer over SMTP). Switching to Gmail is **only an env-var change** — no code edits.

---

## 1. One-time Google account setup

You need a Google account and an **App Password** (a 16-character credential distinct from your login password). Gmail will not accept your normal password over SMTP.

1. Go to <https://myaccount.google.com/security>.
2. Enable **2-Step Verification** if it isn't already on. App Passwords are unavailable without it.
3. Go to <https://myaccount.google.com/apppasswords> (or search "App passwords" in your account settings).
4. Create a new app password — name it e.g. `PaperHub`. Google shows a **16-character** password **once**. Copy it now (you cannot view it again; you'd have to generate a new one).
5. Remove the spaces Google displays — the value you put in env is the 16 characters with **no spaces**.

> Workspace accounts: an admin may have disabled App Passwords. If <https://myaccount.google.com/apppasswords> shows nothing, ask your admin or use a personal Gmail account for the demo.

---

## 2. Backend env configuration

Edit `backend/.env` (gitignored). Replace the local Mailpit block with:

```sh
# --- Gmail SMTP (demo / real inbox) ---
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_SECURE=false                      # 587 uses STARTTLS, upgraded automatically; do NOT set true
SMTP_USER="your.account@gmail.com"     # the Google account that owns the App Password
SMTP_PASS="abcdefghijklmnop"           # the 16-char App Password, no spaces
EMAIL_FROM="your.account@gmail.com"    # MUST match SMTP_USER (Gmail rewrites/rejects mismatches)
EMAIL_FROM_NAME="PaperHub"

# Unrelated to SMTP but required when notifications are on:
NOTIFICATIONS_ENABLED=true
UNSUBSCRIBE_TOKEN_SECRET="<a long random string, distinct from JWT_SECRET>"
```

Key constraints:

| Setting | Value | Why |
|---|---|---|
| `SMTP_HOST` | `smtp.gmail.com` | Gmail's submission host. |
| `SMTP_PORT` | `587` | STARTTLS submission port (recommended). `465` also works but then set `SMTP_SECURE=true`. |
| `SMTP_SECURE` | `false` for 587, `true` for 465 | `secure=true` means "TLS from the first byte" (465). On 587, TLS is negotiated via STARTTLS, so `secure` must be `false`. |
| `SMTP_USER` | full Gmail address | Used for SMTP AUTH. |
| `SMTP_PASS` | 16-char App Password | **Not** your login password. |
| `EMAIL_FROM` | same as `SMTP_USER` | Gmail forces the envelope/From to match the authenticated account. A different `From` gets rewritten or rejected. |

Restart the backend (`npm run dev`) so the new env is loaded.

---

## 3. Verify

1. Ensure a test PaperHub user has the notification preference **on** and at least one tracked topic that will match new papers.
2. Trigger a fetch cycle (wait for the schedule, or temporarily set `FETCH_CRON_EXPR="* * * * *"` and restart to fire one per minute).
3. Watch the backend log for:
   ```
   [notifications] user=<id>: SENT to your.account@gmail.com (3/N papers)
   ```
4. Check the inbox of the test PaperHub user's email address (the recipient is the **user's** email, not necessarily `SMTP_USER`).

---

## 4. Gotchas

- **`From` must equal `SMTP_USER`.** To send from `no-reply@…` you need Google Workspace with a verified domain, or a different provider. For a demo, just send from your own Gmail.
- **First send may land in "Promotions" or show "via gmail.com".** Normal for unauthenticated personal Gmail without SPF/DKIM on a custom domain. Move it to Primary once and Gmail learns.
- **Daily cap ~500 messages.** Fine for demos; not for production. If you hit it, sends start failing with a 5xx — the backend records these as `EmailDeliveryFailure(HARD_BOUNCE)` and quarantines after `HARD_BOUNCE_THRESHOLD` consecutive failures.
- **`535-5.7.8 Username and Password not accepted`** → you used your login password, the App Password has spaces, or 2-Step Verification isn't on. Regenerate the App Password.
- **`534-5.7.9 Application-specific password required`** → same root cause; you must use an App Password, not the account password.
- **Connection refused / timeout** → a firewall or network is blocking outbound 587/465. The backend logs these as `CONNECTION_ERROR` / `TIMEOUT` and keeps running (the cycle is never crashed by a send failure).

---

## 5. Reverting to local Mailpit

Restore the local block in `backend/.env`:

```sh
SMTP_HOST="127.0.0.1"
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=""
SMTP_PASS=""
EMAIL_FROM="no-reply@paperhub.local"
EMAIL_FROM_NAME="PaperHub"
```

Nothing else changes. Start Mailpit (`mailpit`) and emails appear at <http://localhost:8025> instead of a real inbox.

---

## 6. Switching providers entirely

Any SMTP provider works the same way — only env changes, no code. Examples:

| Provider | `SMTP_HOST` | Port | Notes |
|---|---|---|---|
| Gmail | `smtp.gmail.com` | 587 | App Password; `From` must match user. |
| Brevo | `smtp-relay.brevo.com` | 587 | 300/day free; no domain needed for testing. |
| Mailgun | `smtp.mailgun.org` | 587 | Domain verification for production. |
| Postmark | `smtp.postmarkapp.com` | 587 | Server token as `SMTP_PASS`. |
| Amazon SES | `email-smtp.<region>.amazonaws.com` | 587 | SES SMTP credentials. |

If you later want provider features beyond SMTP (webhook bounce reports, etc.), that work lives entirely inside `backend/src/external/email.client.ts` and is out of scope for this iteration (see `research.md` Decision 1 & 3).
