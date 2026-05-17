# Phase 0 Research: User Authentication and Profile Management

**Feature**: `001-user-auth`
**Date**: 2026-05-16

This document resolves the technical unknowns implied by the spec and the planning instruction "make the auth simple, skip security and performance for now." Each decision is paired with rationale and the alternatives considered. The "Simplifications (intentionally deferred)" section records what is being skipped now so a follow-up hardening plan can pick it up cleanly.

## Decisions

### 1. JWT signing algorithm and key management

- **Decision**: HS256 (HMAC-SHA256) with a single shared secret loaded from `JWT_SECRET` in `.env`. Tokens are signed and verified by the same Express service.
- **Rationale**: HS256 needs no key-pair distribution and is one `jsonwebtoken.sign` call. Matches the "simple" directive. The backend is the only verifier, so asymmetric keys add cost with no current benefit.
- **Alternatives considered**:
  - RS256/EdDSA: more appropriate when multiple services verify tokens or rotation matters. Deferred until there are multiple verifiers.
  - Session cookies + opaque IDs: would require a server-side session store. Heavier for the same UX.

### 2. JWT lifetime and refresh strategy

- **Decision**: Single access token, 7-day lifetime (`JWT_TTL=7d`). No refresh token, no sliding session, no server-side revocation list.
- **Rationale**: A long-lived single token removes refresh plumbing entirely while keeping login frequency acceptable for an internal dev environment. Spec FR-006 only requires "expiration after a defined period" — 7 days satisfies that.
- **Alternatives considered**:
  - 15-minute access + 7-day refresh: standard production pattern. Deferred — adds a refresh endpoint, persistence of refresh tokens, and rotation logic.
  - Sliding expiration via reissue on each request: extra branch on every authenticated request. Deferred.

### 3. Logout semantics with stateless JWT

- **Decision**: `POST /api/auth/logout` is a 204 no-op on the server. The frontend discards the token (clears it from storage) on logout. There is no server-side blocklist.
- **Rationale**: Spec FR-007 requires that logout prevents further access. With a stateless token and no revocation list, "further access" is enforced by the client discarding the token. This is the simplest implementation that meets the user-visible behavior for a dev environment.
- **Trade-off**: A stolen token remains usable until it expires. Acceptable per the "skip security" directive. Documented under Simplifications.
- **Alternatives considered**:
  - Revocation list in Redis or a `revoked_tokens` table: real revocation. Deferred to hardening pass.
  - Very short tokens (e.g., 5 min) + refresh: implicit logout via expiry. Deferred (see Decision 2).

### 4. Password storage

- **Decision**: `bcryptjs` with default cost factor (10). Passwords are hashed in the auth service before any repository call; the repository never sees plaintext.
- **Rationale**: The spec (FR-004) and the constitution effectively forbid plaintext password storage. `bcryptjs` is a pure-JS dependency with a one-line API and no native build step — the lowest-friction option that complies. Cost 10 is acceptably fast for development.
- **Alternatives considered**:
  - `argon2`: stronger but requires native bindings, complicating local setup. Defer.
  - Plain SHA-256 or no hashing: explicitly rejected — violates spec FR-004.

### 5. Password strength policy

- **Decision**: Minimum length 8, must contain at least one letter and one digit. Enforced server-side via Zod schema; mirrored client-side as inline form validation hints (not relied on).
- **Rationale**: Meets spec FR-003 ("minimum length and complexity sufficient to resist common attacks") without over-engineering. Common, recognizable rule for dev users.
- **Alternatives considered**:
  - zxcvbn strength estimation: better UX but adds a non-trivial dependency. Defer.

### 6. Email normalization and uniqueness

- **Decision**: Emails are stored lowercased. Uniqueness enforced by a `UNIQUE` index on the lowercased value. Service layer lowercases inputs before any repository call.
- **Rationale**: Matches the spec's edge case ("differs only by letter casing"). Single index, single normalization point.
- **Alternatives considered**:
  - Case-insensitive collation at the column level: works but is MySQL-collation-dependent and harder to reason about. Lowercase-on-write is explicit.

### 7. Generic login error messages

- **Decision**: Both "no such email" and "wrong password" return `401 Unauthorized` with body `{ "error": "Invalid email or password." }`. The service layer never branches the response based on which check failed.
- **Rationale**: Satisfies spec FR-008 with one shared response. Cost is essentially zero — kept even though we are otherwise "skipping security" because it requires no infrastructure.
- **Alternatives considered**:
  - Distinct messages for "no such user" vs "wrong password": better UX but enables account enumeration. Rejected per spec.

### 8. Request validation

- **Decision**: Zod schemas in `backend/src/validation/schemas.ts`, applied in controllers before delegating to services. Schemas type-narrow `unknown` request bodies into concrete TypeScript types.
- **Rationale**: Aligns with constitution principle III (`unknown` only at boundaries, narrowed before use) and principle V (server-side validation before business logic). Zod adds one dependency and gives both runtime checks and inferred types.
- **Alternatives considered**:
  - Hand-written validators: more code, no inferred types.
  - express-validator: less idiomatic with TS and no static types.

### 9. Authentication middleware

- **Decision**: A single `authenticate` middleware reads `Authorization: Bearer <token>`, verifies via `jsonwebtoken.verify`, and attaches `req.userId` (typed via module augmentation). Failure returns `401 Unauthorized` with a generic body.
- **Rationale**: Every protected route reuses the same path. No per-route logic.
- **Alternatives considered**:
  - Per-route inline verification: duplication, drift risk.

### 10. Favorites: paper identifier shape

- **Decision**: `Favorite.paperId` is a `VARCHAR(64)` storing an arXiv identifier (e.g., `2401.12345v2`). There is **no FK** to a `Paper` table — that table does not exist yet (MVP feature #4). Uniqueness enforced by `UNIQUE (userId, paperId)`.
- **Rationale**: Preserves forward compatibility: when feature #4 lands, a single migration can introduce the FK without changing data semantics. Treating it as an opaque string for now also keeps this feature decoupled from arXiv-fetch internals.
- **Alternatives considered**:
  - Wait for feature #4 before shipping favorites: cleanest in MVP-order terms; rejected because the spec was explicitly scoped to include favorites.
  - Numeric `paperId` referencing a stub `Paper` table: adds a table we have no real data for.

### 11. Favorites: existence/accessibility check (spec FR-020)

- **Decision**: For this iteration, the favorite endpoint accepts any well-formed arXiv ID and persists it. We do **not** call arXiv to verify the paper exists.
- **Rationale**: There is no paper catalog yet (see Decision 10). Live-querying arXiv adds network dependency and latency on every favorite. Format validation (regex matching arXiv ID shape) is sufficient for a dev environment.
- **Trade-off**: A user can favorite a syntactically-valid but non-existent paper ID. The frontend mitigates this by only exposing the "favorite" button on paper views once feature #4 lands. Recorded under Simplifications.
- **Alternatives considered**:
  - Call arXiv on every POST: rejected — performance and external dependency.
  - Require the client to pre-fetch and submit metadata: rejected — denormalizes data, complicates the contract.

### 12. Token transport on the frontend

- **Decision**: Token stored in `localStorage` under the key `paperhub.token`. The `api-client.ts` fetch wrapper reads it and sets `Authorization: Bearer ...` on every backend request.
- **Rationale**: Simplest possible client integration; works with Next.js client components without extra cookie/SSR machinery.
- **Trade-off**: `localStorage` is vulnerable to XSS-mediated token theft. Acceptable per "skip security" directive. To be replaced with HTTP-only cookies in the hardening pass.
- **Alternatives considered**:
  - HTTP-only secure cookies: production-correct, but requires CSRF handling and SSR token plumbing. Deferred.

### 13. CORS

- **Decision**: `cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000', credentials: false })`. Single allowed origin, no credentials (since the token is in a header, not a cookie).
- **Rationale**: Matches local dev: Next.js on `:3000`, Express on `:4000`. Single env var to change per environment.
- **Alternatives considered**:
  - Wildcard `*`: works for header-auth, but encodes a bad default. Avoided.

### 14. Error response shape

- **Decision**: All error responses share `{ "error": string, "details"?: unknown }`. Validation errors set `details` to the Zod issue list. Domain errors (e.g., `DuplicateEmailError`) map to fixed status codes in `errorHandler.ts`. Internal errors return a generic `500` with a logged correlation message — never the raw error.
- **Rationale**: Constitution principle V — raw internal/db/provider errors must not leak. One shape across the API simplifies the frontend.
- **Alternatives considered**:
  - Problem Details (RFC 7807): more standard but more fields than needed here.

### 15. Logging

- **Decision**: `console.log` / `console.error` only, with a one-line request log (`method path status duration`). No structured logger.
- **Rationale**: Spec FR-022 (audit logging) is intentionally deferred per user instruction. Basic request logging is kept because it costs nothing and aids local debugging.
- **Alternatives considered**:
  - pino with redaction: production-correct. Deferred.

### 16. Database migrations

- **Decision**: Prisma Migrate (`prisma migrate dev` in development, `prisma migrate deploy` in CI/production once it exists). Initial migration `0001_init_user_auth` creates `User` and `Favorite`.
- **Rationale**: Constitution principle V mandates migration-represented schema changes and Prisma-only DB access. Matches existing tooling assumptions.

### 17. Local MySQL runtime (Docker Compose on the developer's machine)

- **Decision**: MySQL 8.4 runs locally as a Docker container managed by `backend/docker-compose.yml`. The container runs on the developer's own machine via their local Docker daemon (Docker Desktop on macOS/Windows, `docker` on Linux) — no cloud Docker, no remote registry beyond the one-time image pull. A single service exposes MySQL on `localhost:3306` with credentials and database name supplied as environment variables, and data persists to a named volume so restarts do not wipe the dev database.
- **Rationale**: The user explicitly wants the demo to run against Docker-hosted MySQL on their own device. A compose file gives a one-command `docker compose up -d` boot, removes the need for a globally-installed `mysqld`, isolates the dev DB from anything else on the developer's machine, and is trivially tear-down-able. The connection string the backend uses (`DATABASE_URL`) does not change shape — only the host points at the container at `localhost:3306`.
- **Recommended `backend/docker-compose.yml`**:

  ```yaml
  services:
    mysql:
      image: mysql:8.4
      container_name: paperhub-mysql
      restart: unless-stopped
      environment:
        MYSQL_ROOT_PASSWORD: paperhub
        MYSQL_DATABASE: paperhub
        MYSQL_USER: paperhub
        MYSQL_PASSWORD: paperhub
      ports:
        - "3306:3306"
      volumes:
        - paperhub-mysql-data:/var/lib/mysql
      healthcheck:
        test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-ppaperhub"]
        interval: 5s
        retries: 10

  volumes:
    paperhub-mysql-data:
  ```

  Corresponding `DATABASE_URL` in `backend/.env`: `mysql://paperhub:paperhub@localhost:3306/paperhub`.
- **Alternatives considered**:
  - Installing MySQL natively (Homebrew, apt): heavier setup, harder to tear down cleanly, version-conflicts with other projects.
  - SQLite for local-only dev: lower friction but diverges from production storage and would force a conditional Prisma datasource — rejected to keep prod/dev parity on the SQL dialect.
  - Cloud-hosted dev DB (PlanetScale, RDS, cloud Docker runtimes): adds external dependency and credentials for a feature that should run fully offline-local on the developer's own machine.

## Simplifications (intentionally deferred)

These are explicitly out of scope for this iteration per the user's "skip security and performance" instruction. Each one is a behavior the spec asks for; deferring them is a recorded trade-off, not an oversight.

| Spec reference | What is deferred | Why now | Re-introduce when |
|----------------|------------------|---------|-------------------|
| FR-009 | Rate limiting of failed logins | Adds middleware, storage, and config. Local dev does not need it. | Before any internet-facing deployment. |
| FR-022 (full) | Structured audit logging of security events | Requires a logger choice (pino) and a sink. | Same hardening pass as FR-009. |
| FR-006 (revocation) | Server-side token revocation on logout / password change | Needs a blocklist or short-lived access + refresh tokens. | Before public beta. |
| Edge case: session fan-out invalidation on password change | Other devices keep their tokens until expiry | Coupled to revocation infrastructure above. | Same hardening pass. |
| FR-023 (HTTPS) | TLS enforcement | Operational concern, not code in this iteration. | At first non-local deployment. |
| Spec assumption: deferred password reset and email-change flows | Not implemented | Out of spec scope by the user. | Their own `/speckit-specify`. |
| FR-020 (live existence check for favorited paper) | Paper existence is not verified against arXiv | No paper catalog yet (MVP feature #4 pending). | When feature #4 lands — replace string `paperId` with a FK and validate via the paper service. |
| Automated tests (unit / integration / contract) | None in this iteration | Out of scope per "simple" directive. | Before hardening — Vitest + Supertest, with a focus on auth flows and the favorites idempotency contract. |
| Frontend XSS-resistant token storage (HTTP-only cookie) | Token in `localStorage` | Cookie+SSR+CSRF plumbing is significant. | Same hardening pass as token revocation. |
