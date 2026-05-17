---
description: "Task breakdown for the 001-user-auth feature (backend-only scope; frontend deferred)"
---

# Tasks: User Authentication and Profile Management

**Input**: Design documents from `/specs/001-user-auth/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Scope adjustment (2026-05-17)**: Per user instruction, this task list covers **backend implementation only**. Frontend integration is deferred — a separate teammate is reorganizing the frontend directory structure. The existing Next.js Pages Router app already has mock-data auth and favorites screens (`src/pages/auth/login.tsx`, `src/pages/auth/register.tsx`, `src/pages/favorites.tsx`, etc.) plus an `AppStateContext`; wiring those to the real endpoints is owned by that teammate and is tracked here as a single "Frontend Integration Handoff" section, not as actionable tasks.

**Tests**: Automated tests remain explicitly deferred per research.md (Simplifications). Manual acceptance is performed via `curl` walkthroughs (T035, T043, T050, T054).

**Organization**: Tasks are grouped by user story. Each story is independently completable and verifiable on the backend alone.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file from siblings, no dependency on incomplete tasks — safe to parallelize.
- **[Story]**: User-story label (US1, US2, US3) on user-story phase tasks.
- All paths are repository-relative; backend code lives under `backend/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Stand up the backend skeleton and local Docker MySQL so any user story can begin.

- [ ] T001 Create the backend directory tree: `backend/`, `backend/src/`, `backend/src/config/`, `backend/src/middleware/`, `backend/src/controllers/`, `backend/src/services/`, `backend/src/repositories/`, `backend/src/routes/`, `backend/src/validation/`, `backend/prisma/`
- [ ] T002 Create `backend/package.json` with name `paperhub-backend`, `"type": "module"`, scripts `dev` (`tsx watch src/server.ts`), `build` (`tsc -p tsconfig.json`), `start` (`node dist/server.js`), `prisma:migrate` (`prisma migrate dev`), `lint` (`tsc --noEmit`), and dependencies `express`, `@prisma/client`, `jsonwebtoken`, `bcryptjs`, `zod`, `cors`, `dotenv` plus devDependencies `prisma`, `typescript`, `tsx`, `@types/express`, `@types/jsonwebtoken`, `@types/bcryptjs`, `@types/cors`, `@types/node`
- [ ] T003 [P] Create `backend/tsconfig.json` with `"strict": true`, `"target": "ES2022"`, `"module": "ESNext"`, `"moduleResolution": "Bundler"`, `"outDir": "dist"`, `"rootDir": "src"`, `"esModuleInterop": true`, `"resolveJsonModule": true`, `"skipLibCheck": true`
- [ ] T004 [P] Create `backend/.env.example` with keys `DATABASE_URL`, `JWT_SECRET`, `JWT_TTL`, `PORT`, `CORS_ORIGIN` (values matching research.md Decision 17 defaults)
- [ ] T005 [P] Create `backend/.gitignore` excluding `node_modules/`, `dist/`, `.env`
- [ ] T006 [P] Create `backend/docker-compose.yml` with the `mysql:8.4` service, named volume `paperhub-mysql-data`, port `3306:3306`, and the healthcheck defined in research.md Decision 17
- [ ] T007 Run `cd backend && npm install` to install dependencies and generate `backend/package-lock.json`
- [ ] T008 Create `backend/prisma/schema.prisma` with the `mysql` datasource, `prisma-client-js` generator, and the `User` + `Favorite` models exactly as specified in data-model.md
- [ ] T009 [P] Update root `.gitignore` to also exclude `backend/node_modules/`, `backend/dist/`, `backend/.env`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core backend wiring that every user story depends on.

**CRITICAL**: No user story work may begin until this phase is complete.

- [ ] T010 Create `backend/src/config/env.ts` that loads `dotenv`, reads `DATABASE_URL`, `JWT_SECRET`, `JWT_TTL` (default `"7d"`), `PORT` (default `4000`), `CORS_ORIGIN` (default `"http://localhost:3000"`), throws on missing required values, and exports a typed `env` object
- [ ] T011 [P] Create `backend/src/errors.ts` defining domain error classes `DomainError` (base, with `status` and `code`), `DuplicateEmailError` (409), `InvalidCredentialsError` (401), `AuthRequiredError` (401), `NotFoundError` (404), `ValidationFailedError` (400, carries `details: unknown`)
- [ ] T012 [P] Create `backend/src/validation/schemas.ts` exporting an empty module barrel (`export {}` placeholder) — individual schemas are added in each user story phase
- [ ] T013 [P] Create `backend/src/middleware/types.ts` declaring a global Express `Request` augmentation that adds `userId?: number`
- [ ] T014 Create `backend/src/db.ts` exporting a singleton `prisma` instance of `PrismaClient` from `@prisma/client`
- [ ] T015 Create `backend/src/middleware/authenticate.ts` that reads `Authorization: Bearer <token>`, verifies with `jsonwebtoken.verify` using `env.JWT_SECRET`, parses `sub` into `req.userId`, and returns `401 { error: "Authentication required." }` via `AuthRequiredError` on missing/invalid token
- [ ] T016 Create `backend/src/middleware/errorHandler.ts` that maps `DomainError` instances to `res.status(err.status).json({ error: err.message, details: err.details })` and unknown errors to `500 { error: "Internal server error." }` (never the raw error)
- [ ] T017 [P] Create `backend/src/middleware/requestLogger.ts` that logs one line per request: `method path -> status duration_ms` using `console.log`
- [ ] T018 Create `backend/src/server.ts` that builds the Express app: `express.json()` body parser, `cors({ origin: env.CORS_ORIGIN, credentials: false })`, `requestLogger`, a stub `GET /healthz` returning `{ ok: true }`, then `errorHandler` last, and listens on `env.PORT`. Routers are mounted in later phases.
- [ ] T019 Start the database container and create the initial Prisma migration: run `cd backend && docker compose up -d` then `npx prisma migrate dev --name init_user_auth` to produce `backend/prisma/migrations/0001_init_user_auth/migration.sql` and create the tables
- [ ] T020 Smoke-test the foundation: run `cd backend && npm run dev`, then `curl http://localhost:4000/healthz` and verify `{ "ok": true }`; stop the server

**Checkpoint**: Backend boots, MySQL is reachable, migrations are applied. User stories can now begin.

---

## Phase 3: User Story 1 — Register and Log In (Priority: P1) 🎯 MVP

**Goal**: A client can register, log in, and exchange credentials for a JWT.

**Independent Test** (backend-only via curl):

1. `POST /api/auth/register` with a valid body → expect `201` + `{ user, token }`.
2. `POST /api/auth/register` again with the same email (any casing) → expect `409 Conflict`.
3. `POST /api/auth/login` with the same credentials → expect `200` + `{ user, token }`.
4. `POST /api/auth/login` with a wrong password → expect `401 { error: "Invalid email or password." }`.
5. `POST /api/auth/login` with an unknown email → expect the **same** `401` body (no enumeration).
6. `POST /api/auth/logout` → expect `204`.

### Implementation for User Story 1

- [ ] T021 [P] [US1] Append register and login Zod schemas to `backend/src/validation/schemas.ts`: `registerSchema` (`email` valid + lowercased, `password` min 8 chars with letter + digit, `displayName` optional 1-80), `loginSchema` (`email`, `password`)
- [ ] T022 [P] [US1] Create `backend/src/repositories/user.repository.ts` exporting `createUser({ email, passwordHash, displayName })`, `findByEmail(email)` — both using `prisma` from `backend/src/db.ts`; lowercase the email before any read or write
- [ ] T023 [US1] Create `backend/src/services/auth.service.ts` exporting `register(input)` (hashes password via `bcryptjs.hash` cost 10, creates the user, returns `{ user, token }`; maps Prisma unique-constraint error to `DuplicateEmailError`) and `login(input)` (finds by email, `bcryptjs.compare`, throws `InvalidCredentialsError` on either miss, returns `{ user, token }`); add a private `signToken(userId)` using `jsonwebtoken.sign` with `env.JWT_SECRET` and `expiresIn: env.JWT_TTL`
- [ ] T024 [US1] Create `backend/src/controllers/auth.controller.ts` with three handlers `register`, `login`, `logout`: validate the request body via the Zod schemas (throw `ValidationFailedError` with `error.flatten()` on failure), delegate to `auth.service`, return the response shapes from `contracts/auth.md`; `logout` returns `204` unconditionally
- [ ] T025 [US1] Create `backend/src/routes/auth.routes.ts` exporting an Express `Router` mounting `POST /register`, `POST /login`, `POST /logout`; mount it in `backend/src/server.ts` under `/api/auth`
- [ ] T026 [US1] Run the curl walkthrough for the six scenarios above against `http://localhost:4000/api/auth`. Tick each off; note any deviation from `contracts/auth.md`.

**Checkpoint**: User Story 1 is backend-complete. Tokens issued here are usable by the next stories.

---

## Phase 4: User Story 2 — View and Edit Profile (Priority: P2)

**Goal**: A client with a valid bearer token can read and modify their own profile and change their password.

**Independent Test** (backend-only via curl, after obtaining a token from Story 1):

1. `GET /api/users/me` with the token → expect `200` + the profile shape from `contracts/users.md`.
2. `PATCH /api/users/me` with `{ "displayName": "New Name" }` → expect `200` + updated profile.
3. `PATCH /api/users/me` with `{}` → expect `400` (at-least-one-field rule).
4. `POST /api/users/me/password` with the correct current password and a strong new one → expect `204`.
5. `POST /api/users/me/password` with a wrong current password → expect `401 { error: "Invalid current password." }`.
6. `GET /api/users/me` without a token → expect `401 { error: "Authentication required." }`.

### Implementation for User Story 2

- [ ] T027 [P] [US2] Append `updateProfileSchema` (optional `displayName` 1-80, optional `bio` nullable max 500, refine "at least one field present") and `changePasswordSchema` (`currentPassword`, `newPassword` with strength rule + must differ from `currentPassword`) to `backend/src/validation/schemas.ts`
- [ ] T028 [P] [US2] Extend `backend/src/repositories/user.repository.ts` with `findById(id)`, `updateProfile(id, { displayName?, bio? })`, `updatePasswordHash(id, hash)`
- [ ] T029 [US2] Create `backend/src/services/users.service.ts` exporting `getMe(userId)` (throws `NotFoundError` if absent), `updateMe(userId, input)` (delegates to repository, returns the updated row), `changePassword(userId, { currentPassword, newPassword })` (loads user, `bcryptjs.compare` against stored hash → on mismatch throw `InvalidCredentialsError` with message "Invalid current password.", otherwise hash the new password and persist)
- [ ] T030 [US2] Create `backend/src/controllers/users.controller.ts` with `getMe`, `updateMe`, `changePassword` handlers — each reads `req.userId` (set by the `authenticate` middleware), validates the body with the Zod schemas, delegates to `users.service`, and shapes the response per `contracts/users.md`
- [ ] T031 [US2] Create `backend/src/routes/users.routes.ts` exporting a `Router` that applies `authenticate` middleware, then mounts `GET /me`, `PATCH /me`, `POST /me/password`; mount it in `backend/src/server.ts` under `/api/users`
- [ ] T032 [US2] Run the curl walkthrough for the six scenarios above. Tick each off; note any deviation from `contracts/users.md`.

**Checkpoint**: Stories 1 and 2 are both backend-complete.

---

## Phase 5: User Story 3 — Save and Manage Favorite Papers (Priority: P3)

**Goal**: A client with a valid bearer token can add, list, and remove their own favorites; add is idempotent.

**Independent Test** (backend-only via curl, with a token from Story 1):

1. `POST /api/favorites` with `{ "paperId": "2401.12345v2" }` → expect `201` + the favorite row.
2. `POST /api/favorites` again with the same body → expect `200` + the same row (no duplicate).
3. `GET /api/favorites` → expect `200` + a list containing exactly one entry for that `paperId`.
4. `DELETE /api/favorites/2401.12345v2` → expect `204`.
5. `DELETE /api/favorites/2401.12345v2` again → expect `404 { error: "Favorite not found." }`.
6. `POST /api/favorites` without a token → expect `401`.
7. `POST /api/favorites` with an invalid `paperId` (e.g., `"!!"`) → expect `400`.

### Implementation for User Story 3

- [ ] T033 [P] [US3] Append `paperIdSchema` (regex `^[A-Za-z0-9.\-/]{3,64}$` after trim) and `addFavoriteSchema` (object with `paperId`) to `backend/src/validation/schemas.ts`
- [ ] T034 [P] [US3] Create `backend/src/repositories/favorite.repository.ts` exporting `listByUser(userId)` (orders by `createdAt DESC`), `findByUserAndPaper(userId, paperId)`, `addForUser(userId, paperId)` (returns the row), `removeForUser(userId, paperId)` (returns boolean indicating whether a row was deleted)
- [ ] T035 [US3] Create `backend/src/services/favorites.service.ts` exporting `list(userId)`, `add(userId, paperId)` (look up first; if exists return `{ favorite, created: false }`; otherwise insert; map Prisma unique-violation to "already favorited" to absorb the race), `remove(userId, paperId)` (throws `NotFoundError` if `removeForUser` returns false)
- [ ] T036 [US3] Create `backend/src/controllers/favorites.controller.ts` with `list`, `add` (returns `201` when created, `200` when pre-existing), `remove` (returns `204`) handlers
- [ ] T037 [US3] Create `backend/src/routes/favorites.routes.ts` exporting a `Router` that applies `authenticate` middleware, then mounts `GET /`, `POST /`, `DELETE /:paperId`; mount it in `backend/src/server.ts` under `/api/favorites`
- [ ] T038 [US3] Run the curl walkthrough for the seven scenarios above. Tick each off; note any deviation from `contracts/favorites.md`.

**Checkpoint**: All three user stories are backend-complete. The backend MVP is shippable for the frontend teammate to integrate against.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, lint, and a final clean-room walkthrough.

- [ ] T039 [P] Update root `README.md` with a "Backend (Express + MySQL via Docker)" section linking to `specs/001-user-auth/quickstart.md` and the contract files
- [ ] T040 [P] Confirm `backend/.env` is gitignored (verify after T009 lands)
- [ ] T041 Run `cd backend && npm run lint` (`tsc --noEmit`) and confirm zero errors
- [ ] T042 Execute the full backend walkthrough end-to-end starting from a clean state: `cd backend && docker compose down -v && docker compose up -d && npx prisma migrate dev && npm run dev`, then run the curl walkthroughs from T026, T032, and T038 in sequence

---

## Frontend Integration Handoff (deferred — owned by frontend teammate)

**Status**: Not actionable in this task list. Tracked here so nothing is dropped on the handoff.

**Primary doc for the integrator**: [`frontend-integration.md`](./frontend-integration.md) — full how-to including base URL, token handling, error shapes, screen-to-endpoint mapping, validation rules, things explicitly NOT to build in this iteration, and a smoke checklist. The teammate doing the reorg should start there.

The existing frontend (Next.js Pages Router at the repo root) already has the relevant screens as mock-data UI. Integration consists of replacing the mocks with real fetch calls. The teammate doing the frontend reorg owns these tasks; they are listed for reference only.

**Existing files that will be wired up** (verified on `001-user-auth` at 2026-05-17):

- `src/pages/auth/login.tsx` (rendered by `src/screens/Login.tsx`)
- `src/pages/auth/register.tsx` (rendered by `src/screens/Register.tsx`)
- `src/pages/auth/forgot-password.tsx` (rendered by `src/screens/ForgotPassword.tsx`) — **out of scope for this feature**; password reset is deferred per spec Assumptions.
- `src/pages/favorites.tsx` (rendered by `src/screens/Favorites.tsx`)
- `src/state/AppStateContext.tsx` — currently backed by `src/mockData.ts`; will need a real auth/profile slice and token persistence.
- `src/components/layout/Header.tsx` — typically where the logout control lives.

**Integration contract**: Frontend integration must match `specs/001-user-auth/contracts/*.md` byte-for-byte. Any deviation discovered during integration should be raised back to this spec, not papered over on either side.

**Sequencing note**: Until the frontend teammate finishes the reorg + integration, the backend is exercised exclusively via the curl walkthroughs in Phases 3-5. Quickstart steps 1-14 (the browser walkthrough) are blocked on their work and will be ticked then.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1. **Blocks all user stories.**
- **User Story 1 (Phase 3)**: Depends on Phase 2. The backend MVP increment.
- **User Story 2 (Phase 4)**: Depends on Phase 2. Re-uses `authenticate` and the `User` repository; extends both with new methods (different exported names) so no file conflict with US1.
- **User Story 3 (Phase 5)**: Depends on Phase 2. New files only — no conflict with US1 or US2.
- **Polish (Phase 6)**: Depends on the user stories you're shipping.

### User Story Dependencies

- **US1 (P1)**: Independent after Phase 2.
- **US2 (P2)**: Independent after Phase 2.
- **US3 (P3)**: Independent after Phase 2.

### Within Each User Story

- The schema task and the repository task (both [P]) run first.
- Service → controller → routes/mount → curl walkthrough, strictly in that order.

### Parallel Opportunities

- Phase 1: T003, T004, T005, T006, T009 are [P] after T001 lands. T002 and T007 are serial.
- Phase 2: T011, T012, T013, T017 are [P]. T014, T015, T016, T018, T019, T020 are serial gates.
- Within each user story: the schema task and the repository task can run in parallel; the service/controller/routes chain is serial.

---

## Parallel Example: User Story 1

```text
# After Phase 2 (foundational) completes:
- T021 [US1] Zod schemas for register/login        (backend/src/validation/schemas.ts)
- T022 [US1] user.repository (create + findByEmail) (backend/src/repositories/user.repository.ts)

# Then converge:
- T023 service depends on T021 + T022
- T024 controller depends on T023
- T025 routes/mount depends on T024
- T026 curl walkthrough depends on T025
```

---

## Implementation Strategy

### Backend MVP (User Story 1 only)

1. Complete Phase 1 (Setup).
2. Complete Phase 2 (Foundational).
3. Complete Phase 3 (US1).
4. **STOP and VALIDATE** with T026.
5. Hand the token-issuing endpoints to the frontend teammate; defer US2 and US3 if needed.

### Incremental Delivery

1. Setup + Foundational → backend foundation ready.
2. US1 → curl walkthrough (T026) → frontend teammate can begin auth integration.
3. US2 → curl walkthrough (T032) → frontend teammate can integrate profile UI.
4. US3 → curl walkthrough (T038) → frontend teammate can integrate favorites UI.
5. Polish (Phase 6).

### Solo Backend Strategy

With one developer doing backend, all phases are sequential. The [P] tags inside each phase just identify the natural boundaries where you could pick up after a coffee break without losing context.

---

## Notes

- [P] tasks operate on different files and depend only on earlier-completed tasks; safe to parallelize.
- The curl walkthroughs (T026, T032, T038, T042) are this iteration's test suite — do not skip them.
- Per research.md "Simplifications" table, the following spec FRs are intentionally **not** addressed by any task here: FR-009 (rate limiting), FR-022 full audit logging, FR-006 server-side revocation, FR-023 HTTPS enforcement, FR-020 live paper existence check. They will be picked up by a follow-up hardening feature.
- Frontend integration is owned by a separate teammate doing a directory reorganization; see "Frontend Integration Handoff" above. Do not edit `src/pages/`, `src/screens/`, `src/state/`, or `src/components/` as part of these tasks.
- Commit after each task or each logical pair (schema + repository, service + controller, etc.). The optional `/speckit-git-commit` hook is available between phases.
- If `T019` (`prisma migrate dev`) fails with a connection error, confirm the container is healthy: `docker compose ps` should show `paperhub-mysql` as `healthy`. Wait a few seconds after `docker compose up -d` for the healthcheck to pass.
