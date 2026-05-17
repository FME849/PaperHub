# Quickstart: User Authentication and Profile Management

**Feature**: `001-user-auth`
**Audience**: A developer running the feature locally for the first time.

This walkthrough is the manual acceptance test for the feature. Each numbered step maps to one of the spec's acceptance scenarios.

## Prerequisites

- Node.js 20+ and npm.
- **Docker Desktop** (macOS/Windows) or a local `docker` daemon (Linux) running on your own machine. MySQL is run as a local container — nothing is hosted in the cloud.
- The repo cloned and on branch `001-user-auth`.

## One-time setup

1. **Start the local MySQL container** (defined in `backend/docker-compose.yml` — see research Decision 17):
   ```bash
   cd backend
   docker compose up -d
   ```
   This pulls `mysql:8.4` (first run only) and starts a container named `paperhub-mysql` listening on `localhost:3306`. Data persists in the `paperhub-mysql-data` Docker volume across restarts. Verify it is healthy:
   ```bash
   docker compose ps
   ```

2. **Create the backend `.env`** (start from `backend/.env.example`):
   ```bash
   cp .env.example .env
   ```
   With the default compose credentials, the values are:
   ```text
   DATABASE_URL="mysql://paperhub:paperhub@localhost:3306/paperhub"
   JWT_SECRET="dev-secret-do-not-use-in-prod"
   JWT_TTL="7d"
   PORT=4000
   CORS_ORIGIN="http://localhost:3000"
   ```

3. **Install backend dependencies and run migrations**:
   ```bash
   npm install
   npx prisma migrate dev --name init_user_auth
   cd ..
   ```
   This creates the `User` and `Favorite` tables inside the container.

4. **Install / verify frontend dependencies** at the repo root:
   ```bash
   npm install
   ```

5. **Frontend env**: create `.env.local` at the repo root with:
   ```text
   NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
   ```

## Run

Open two terminals.

- Terminal A (backend): `cd backend && npm run dev` — Express on `:4000`.
- Terminal B (frontend): `npm run dev` from the repo root — Next.js on `:3000`.

## Acceptance walkthrough

### Story 1 — Register and log in (P1)

1. Open `http://localhost:3000/register`. Fill in `email`, `password`, optional `displayName`. Submit.
   - Expected: redirect to a logged-in landing area. **Maps to**: spec Story 1, scenario 1.
2. Log out (header button), then go to `http://localhost:3000/login` and sign in with the same credentials.
   - Expected: logged-in state restored. **Maps to**: Story 1, scenario 2.
3. Try to register again with the same email (any casing variant).
   - Expected: `409 Conflict` surfaced as a clear, non-enumerating message. **Maps to**: Story 1, scenario 3, and the case-insensitivity edge case.
4. Try to log in with a wrong password.
   - Expected: a generic "Invalid email or password" message. **Maps to**: Story 1, scenario 4 and FR-008.
5. Click logout, then attempt to open `http://localhost:3000/profile` directly.
   - Expected: redirected to `/login`. **Maps to**: Story 1, scenario 5.

### Story 2 — View and edit profile (P2)

6. After logging back in, open `http://localhost:3000/profile`.
   - Expected: current email, display name, bio shown. **Maps to**: Story 2, scenario 1.
7. Change `displayName`, save.
   - Expected: success confirmation; refresh shows the new value. **Maps to**: Story 2, scenario 2.
8. Open the password-change form. Submit `currentPassword` + a new password that meets the rules.
   - Expected: success. The current session remains active (session fan-out invalidation is deferred — see plan Complexity Tracking). **Maps to**: Story 2, scenario 3.
9. Log out, then visit `/profile` directly.
   - Expected: redirect to `/login`. **Maps to**: Story 2, scenario 4.
10. While logged in, submit an empty `displayName`.
    - Expected: field-level validation error; no change persisted. **Maps to**: Story 2, scenario 5 and FR-014.

### Story 3 — Save and manage favorite papers (P3)

11. While logged in, POST a favorite via the API client (until the paper-detail UI is built):
    ```bash
    curl -X POST http://localhost:4000/api/favorites \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"paperId":"2401.12345v2"}'
    ```
    - Expected: `201 Created` and the favorite appears at `http://localhost:3000/favorites`. **Maps to**: Story 3, scenarios 1 and 2.
12. Re-issue the same POST.
    - Expected: `200 OK` (idempotent); the list still has exactly one entry for that paperId. **Maps to**: Story 3, scenario 5, and FR-018.
13. From the favorites page, remove the paper.
    - Expected: it disappears from the list. **Maps to**: Story 3, scenario 3.
14. Log out, then attempt the favorites curl without a bearer token.
    - Expected: `401 Unauthorized`. **Maps to**: Story 3, scenario 4 and FR-021.

## Cleanup

```bash
# Stop the MySQL container (keeps data).
cd backend && docker compose stop

# Or: stop and wipe the dev database completely.
cd backend && docker compose down -v   # -v also removes the paperhub-mysql-data volume
docker compose up -d
npx prisma migrate dev                 # recreate tables on the fresh volume
```

## What is intentionally not in this walkthrough

These behaviors are explicitly deferred in this iteration (see plan Complexity Tracking and `research.md` Simplifications):

- Rate limiting / lockout after repeated failed logins.
- Automatic session invalidation on other devices after a password change.
- Server-side token revocation on logout.
- Verification that a `paperId` corresponds to a real paper.
- Audit log entries for security events.

Each will be addressed in a follow-up hardening feature.
