# Quickstart: Password Reset via Email

Manual end-to-end validation for `005-password-reset-email`. Assumes `001`–`004` are working. Uses a local SMTP catcher (Mailpit) so no real mail is sent; for a real inbox see `../004-paper-email-notifications/gmail-smtp-setup.md` (same `SMTP_*` config).

---

## 1. Prerequisites

- `001`–`004` set up and the backend runs (`npm run dev` from `backend/`).
- A local SMTP catcher on `:1025` (Mailpit recommended): `brew install axllent/apps/mailpit && mailpit` (web UI at `http://localhost:8025`).
- The `004` email env block already present in `backend/.env` (SMTP host/port etc.). Password reset reuses it.

---

## 2. Migrate the database

```sh
cd backend
npx prisma migrate dev --name password_reset    # creates 0005_password_reset:
                                                 #   User.passwordChangedAt,
                                                 #   PasswordResetRequest, PasswordResetAuditEvent
npx prisma generate
```

---

## 3. Configure environment

Add to `backend/.env` (and see `.env.example` for the documented keys):

```sh
# Password reset (005-password-reset-email)
PASSWORD_RESET_TOKEN_TTL_MINUTES=60        # link lifetime
PASSWORD_RESET_MAX_SEND_RETRIES=3          # bounded async-send retries
PASSWORD_RESET_RETRY_BACKOFF_MS=2000       # delay between retries
PASSWORD_RESET_RATE_LIMIT_PER_EMAIL=5      # forgot-password requests per email per window
PASSWORD_RESET_RATE_LIMIT_PER_IP=15        # forgot/verify requests per IP per window
PASSWORD_RESET_RATE_LIMIT_WINDOW_MS=900000 # 15-minute window
```

Restart the backend.

---

## 4. Create a test user

```sh
curl -s -X POST http://localhost:4000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"reset-tester@paperhub.local","password":"oldPass123","displayName":"Reset Tester"}'
```

---

## 5. Request a reset link (US1)

```sh
curl -s -X POST http://localhost:4000/api/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"reset-tester@paperhub.local"}'
# => 200 {"message":"If an account exists for that address, a password reset link has been sent."}
```

Then, the **enumeration check** — an unknown email returns the **identical** body, and sends no email:

```sh
curl -s -X POST http://localhost:4000/api/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"nobody@paperhub.local"}'
# => 200 {"message":"If an account exists for that address, a password reset link has been sent."}
```

Open Mailpit (`http://localhost:8025`): there should be **exactly one** email (for the real account), with:

- A responsive HTML body and plain-text alternative.
- A "Reset your password" link to `http://localhost:3000/reset-password?token=<raw>`.
- A visible **"This link expires in 60 minutes"** notice.

Copy the `token` value from the link for the next steps.

---

## 6. Validate the link (UX pre-check)

```sh
curl -s "http://localhost:4000/api/auth/reset-password?token=<RAW_TOKEN>"
# => 200 {"valid":true}
```

---

## 7. Set a new password (US2)

```sh
curl -s -X POST http://localhost:4000/api/auth/reset-password \
  -H 'Content-Type: application/json' \
  -d '{"token":"<RAW_TOKEN>","newPassword":"newPass456"}'
# => 200 {"message":"Your password has been reset. You can now log in with your new password."}

# new password works:
curl -s -o /dev/null -w "new=%{http_code}\n" -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"reset-tester@paperhub.local","password":"newPass456"}'   # 200

# old password fails:
curl -s -o /dev/null -w "old=%{http_code}\n" -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"reset-tester@paperhub.local","password":"oldPass123"}'   # 401
```

---

## 8. Single-use + expiry (US2 / US3)

```sh
# reuse the same token -> rejected (single-use):
curl -s -X POST http://localhost:4000/api/auth/reset-password \
  -H 'Content-Type: application/json' \
  -d '{"token":"<RAW_TOKEN>","newPassword":"another789"}'
# => 400 {"error":"This reset link is invalid or has expired. Please request a new one."}
```

Expiry: set `PASSWORD_RESET_TOKEN_TTL_MINUTES=0` (or wait out the window), request a new link, and confirm `GET /reset-password?token=…` returns `{"valid":false}` and `POST` returns `400`.

---

## 9. Supersede prior link (US1 scenario 5)

Request two reset links in a row for the same account. Confirm the **first** token now returns `{"valid":false}` / `400`, and only the **second** works.

---

## 10. Prior-session invalidation (US3 / FR-010)

```sh
# 1. log in to get a token BEFORE a reset
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"reset-tester@paperhub.local","password":"newPass456"}' | jq -r .token)

# 2. confirm it works on a protected route
curl -s -o /dev/null -w "before=%{http_code}\n" -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/users/me   # 200

# 3. perform another password reset (steps 5+7) ...

# 4. the OLD token is now rejected (issued before passwordChangedAt)
curl -s -o /dev/null -w "after=%{http_code}\n" -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/users/me    # 401
```

Also verify FR-011: with an outstanding reset link, change the password via the authenticated `001` change-password flow, then confirm the outstanding link is now `{"valid":false}`.

---

## 11. Rate limiting (US3)

Fire `forgot-password` for the same email past `PASSWORD_RESET_RATE_LIMIT_PER_EMAIL` within the window: the response stays the **neutral 200** (never leaks the throttle per-account) but no additional emails appear in Mailpit, and `THROTTLED` audit events are recorded. Hammer `GET /reset-password?token=…` past `PASSWORD_RESET_RATE_LIMIT_PER_IP` and confirm `429`.

---

## 12. Audit + no-secret check

```sh
npx prisma studio   # http://localhost:5555
# PasswordResetAuditEvent: REQUESTED / SUPPRESSED_NO_ACCOUNT / LINK_VERIFIED / COMPLETED / THROTTLED rows.
# PasswordResetRequest: tokenHash is a 64-char hex (NOT the raw token); consumedAt/invalidatedAt set as expected.
```

Confirm no row anywhere stores the raw token or a password, and the email body contains no password (FR-015/FR-016/SC-007).

---

## 13. Cleanup

```sh
npx prisma studio   # delete the test user (cascades to its reset rows)
# or, dev only:
npx prisma migrate reset
```

Stop Mailpit (`Ctrl-C`).

---

## Reference

- Contract: [contracts/password-reset.md](./contracts/password-reset.md)
- Data model: [data-model.md](./data-model.md)
- Decisions: [research.md](./research.md)
- Spec: [spec.md](./spec.md)
- Gmail (real inbox) overlay: `../004-paper-email-notifications/gmail-smtp-setup.md`
