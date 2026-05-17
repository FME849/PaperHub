# Implementation Plan: User Authentication and Profile Management

**Branch**: `001-user-auth` | **Date**: 2026-05-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-user-auth/spec.md`

## Summary

Deliver email + password registration and login, authenticated profile view/edit (including password change), and per-user favorite papers. Authentication uses stateless JWT bearer tokens issued by the backend on login. Per the user's planning instruction ("make the auth simple, skip security and performance for now"), this plan intentionally drops production hardening (rate limiting, refresh tokens, token blocklists, session-fan-out invalidation, audit logging, account lockout, email verification, password reset). Passwords are still hashed (the spec forbids plaintext storage, and bcrypt is one dependency). The simplifications are tracked explicitly so they can be re-added in a follow-up hardening pass before any non-dev environment.

The backend is a new Express + TypeScript service under `/backend` (per constitution principle I), structured into controllers / services / repositories / config (principle II), with Prisma + MySQL for persistence (principle V). The frontend adds Next.js pages and API client code for the auth and favorites flows.

## Technical Context

**Language/Version**: TypeScript 5.8 in strict mode (both frontend and backend); Node.js 20+ for the backend runtime.
**Primary Dependencies**:
- Backend: `express`, `@prisma/client`, `prisma`, `jsonwebtoken`, `bcryptjs`, `zod` (input validation), `cors`, `dotenv`, `tsx` (dev runner).
- Frontend: existing Next.js 15 + React 19 + Tailwind + shadcn stack already present at the repo root.
**Storage**: MySQL 8.4 via Prisma. Run locally as a Docker container on the developer's machine, managed by `backend/docker-compose.yml` (no cloud Docker, no remote DB). Data persists to a named Docker volume so restarts do not wipe the dev DB. New tables: `User`, `Favorite`. Migrations checked in under `backend/prisma/migrations/`. See research Decision 17.
**Testing**: Manual quickstart walkthrough (see `quickstart.md`). Automated tests are explicitly out of scope for this iteration per the "simple" directive; a follow-up plan will introduce Vitest/Supertest before hardening.
**Target Platform**: Web app — Next.js frontend served on port 3000, Express REST API served on port 4000, MySQL 8.x reachable via connection string. Local development on macOS/Linux; production deployment is out of scope here.
**Project Type**: Web application (frontend + backend), matching the constitution's two-tier product layout.
**Performance Goals**: Per user instruction, performance is explicitly deferred. The spec's UX-level targets (login < 2s, favorite < 1s perceived) are tracked but no caching, indexing beyond unique constraints, or load testing is planned in this iteration.
**Constraints**: Must remain compatible with the constitution's stack (Next.js, Express, TS strict, Prisma/MySQL, REST). Must not block future MVP features (#4 paper storage, others) — favorites stores `paperId` as a string (arXiv ID) without a FK so the Paper table can be added later without a destructive migration.
**Scale/Scope**: Pre-MVP, single-server local development. Expected initial user count: < 100. Three REST resource groups (auth, users, favorites), nine endpoints, two new tables.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Fixed Product Stack | PASS | Next.js + TS frontend, Express + TS backend, REST, MySQL + Prisma, JWT (in line with the spec's "JWT" hint). No AI/arXiv touch in this feature. |
| II. Layered Backend Architecture | PASS | Controllers (HTTP only), services (business logic, JWT signing/verification, password hashing orchestration), repositories (Prisma calls), config module (env loader). |
| III. Strict TypeScript and Async Code | PASS | `tsconfig` strict, no `any`, `unknown` only at request-body boundaries (validated by Zod before use), `async/await` throughout. |
| IV. Isolated External and AI Services | N/A | This feature does not call OpenAI or arXiv. |
| V. REST, Configuration, and Data Discipline | PASS | Resource-oriented endpoints, meaningful status codes, server-side input validation, env vars centralized in `backend/src/config/env.ts`, `.env.example` updated, MySQL migrations under `backend/prisma/migrations/`, all DB access via Prisma in repositories. |
| Repository Folder Rules | DEVIATION | The Next.js app currently lives at the repo root rather than `/frontend`. See **Complexity Tracking**. |
| Implementation Standards | PASS | Controllers do no DB calls; services take typed inputs (not raw `Request`); repositories do no HTTP; protected workflows on the frontend handle 401 by routing to `/login`. |
| MVP Delivery Order | DEVIATION | Constitution MVP order lists "Save paper to favorites" as item #9, after paper storage (#4). This feature implements favorites before #4 because the spec was scoped that way by the user. See **Complexity Tracking**. |

Both gate deviations are documented below with simpler alternatives. Re-check after Phase 1: no further violations introduced by the design.

## Project Structure

### Documentation (this feature)

```text
specs/001-user-auth/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (REST contract per endpoint group)
│   ├── auth.md
│   ├── users.md
│   └── favorites.md
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
backend/                                    # NEW: Express + TypeScript service
├── package.json
├── tsconfig.json
├── .env.example
├── docker-compose.yml                      # NEW: local MySQL 8.4 container (research Decision 17)
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│       └── 0001_init_user_auth/
│           └── migration.sql
└── src/
    ├── server.ts                           # Express bootstrap, mounts routers
    ├── config/
    │   └── env.ts                          # Centralized env loader (DATABASE_URL, JWT_SECRET, JWT_TTL, PORT)
    ├── middleware/
    │   ├── authenticate.ts                 # Verifies JWT, attaches userId to req
    │   └── errorHandler.ts                 # Maps known errors to safe responses
    ├── controllers/
    │   ├── auth.controller.ts              # /api/auth/register, /login, /logout
    │   ├── users.controller.ts             # /api/users/me (GET, PATCH), /password
    │   └── favorites.controller.ts         # /api/favorites (GET, POST, DELETE)
    ├── services/
    │   ├── auth.service.ts                 # Registration, login, password hashing, JWT signing
    │   ├── users.service.ts                # Profile read/update, password change
    │   └── favorites.service.ts            # Add/list/remove favorites (idempotent)
    ├── repositories/
    │   ├── user.repository.ts              # Prisma calls for User
    │   └── favorite.repository.ts          # Prisma calls for Favorite
    ├── validation/
    │   └── schemas.ts                      # Zod schemas for all request bodies
    └── errors.ts                           # Domain error classes (DuplicateEmail, InvalidCredentials, ...)

# Frontend additions (in the existing root-level Next.js app — see deviation below)
src/
├── app/
│   ├── login/page.tsx                      # NEW
│   ├── register/page.tsx                   # NEW
│   ├── profile/page.tsx                    # NEW
│   └── favorites/page.tsx                  # NEW
├── lib/
│   ├── api-client.ts                       # NEW: fetch wrapper that attaches the JWT
│   └── auth-context.tsx                    # NEW: client-side auth state + 401 redirect
components/
└── auth/                                   # NEW: shared form components
    ├── LoginForm.tsx
    ├── RegisterForm.tsx
    └── ProfileForm.tsx
```

**Structure Decision**: New backend service rooted at `/backend` matching constitution principle I and the layered architecture in principle II. The frontend uses the existing Next.js application currently at the repo root (`src/`, `components/`); see Complexity Tracking for the folder-rule deviation. Database access is exclusively through Prisma from repository modules; controllers only parse requests and shape responses.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| Frontend remains at repo root rather than `/frontend` | The Next.js app, `package.json`, `tsconfig.json`, `components/`, `src/`, Tailwind config, and `node_modules/` already live at the repo root. Moving them is a multi-step refactor that touches build scripts, IDE config, deploy expectations, and unrelated existing pages — out of scope for an auth feature. | Moving Next.js to `/frontend` as part of this feature was considered. Rejected because it inflates the PR, mixes infrastructure churn with security-sensitive auth code, and risks regressing pages unrelated to this spec. Recommend a dedicated `/speckit-specify` for the move once auth lands. |
| Implementing favorites (constitution MVP item #9) before paper storage (item #4) | The user's `/speckit-specify` input deliberately bundled favorites with auth. Splitting would invalidate the approved spec. To stay compatible with future feature #4, the `Favorite` table stores `paperId` as a string (arXiv-style identifier) with no FK to a not-yet-existing `Paper` table. | Deferring favorites to a follow-up feature was considered and is the cleaner option in pure constitution terms. Rejected because the spec is already locked, and the FK-free `paperId` choice keeps a forward-compatible upgrade path — a single `ALTER TABLE` migration adds the FK once `Paper` exists. |
| Several spec FRs are intentionally deferred (rate limiting FR-009, audit logging FR-022, session-fan-out invalidation in edge cases) | User instruction: "make the auth simple, skip security and performance for now." Implementing all controls now would 2-3x the surface area and slow first delivery. | Keeping all controls was considered. Rejected per explicit user direction. Tracked in `research.md` "Simplifications" section so a follow-up hardening plan can pick them up; the deferrals are confined to behaviors that fail closed (missing them does not silently corrupt data). |
