# Implementation Plan: Tracked Research Topics with Periodic Paper Fetch

**Branch**: `002-topic-subscription` | **Date**: 2026-05-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-topic-subscription/spec.md`

## Summary

Deliver MVP items **#2 (add/edit/delete topics)**, **#3 (auto-fetch papers from arXiv by topic)**, and **#6 (per-topic list of new papers)** as a backend-only iteration. Authenticated users own tracked topics (name + keywords + source filters); a scheduled in-process job runs at a fixed cadence, queries arXiv per topic over an incremental window (papers indexed since the previous cycle), de-duplicates attributions per (topic, paper), caps newly attributed papers per topic per cycle, and exposes a per-topic paper view via REST. Per the explicit spec decisions: no historical backfill on topic creation (Option A), no on-demand "refresh now", no keyword suggestions, no notifications. v1 source catalog is arXiv only; the schema is shaped so additional sources can be added later without breaking existing topics.

Frontend integration for this feature is **deferred** in this iteration — the frontend reorg is being handled separately by another teammate (per the project's working agreement) — so this plan delivers only the backend service, schema, scheduler, REST contracts, and the operator quickstart. The contracts are sufficient for a future frontend slice to pick up the work without changing the backend.

The backend extends the existing Express + TypeScript service in `/backend` (introduced by `001-user-auth`), reuses the existing `User` table, JWT auth middleware, MySQL container, and Prisma migration trail. New tables are `TrackedTopic`, `Paper`, `TopicPaperMatch`, and `FetchCycle`; the recognized-source catalog lives in code (not DB) for v1.

## Technical Context

**Language/Version**: TypeScript 5.8 strict on both frontend and backend; Node.js 20+ for the backend runtime.
**Primary Dependencies** (backend, additions beyond what 001 already installed):

- `node-cron` — in-process scheduler for the periodic fetch cycle (Constitution Principle IV: scheduled jobs MUST call services, not embed logic).
- `fast-xml-parser` — parse arXiv's Atom XML responses.
- `undici` (already a Node 20 built-in via `fetch`; pinned for typed responses if needed) — HTTP client for arXiv.
- Existing from 001: `express`, `@prisma/client`, `prisma`, `jsonwebtoken`, `zod`, `cors`, `dotenv`, `tsx`, `bcryptjs`.

**Storage**: MySQL 8.4 via Prisma, the same container managed by `backend/docker-compose.yml` from 001. New tables: `TrackedTopic`, `Paper`, `TopicPaperMatch`, `FetchCycle`. New migration `0002_tracked_topics/` (additive only — no changes to existing 001 tables).
**Testing**: Manual quickstart walkthrough (`quickstart.md`), matching 001's "simple" precedent. Automated tests remain explicitly out of scope until a follow-up hardening pass.
**Target Platform**: same as 001 — Express REST API on port 4000, MySQL 8.x via connection string. Local development on macOS/Linux; production deployment is out of scope.
**Project Type**: Web application (backend-only in this iteration; frontend deferred).
**Performance Goals**: Per 001's "skip perf for now" precedent, no caching, no benchmarking. The arXiv API rate limit (~1 req / 3 s courteous rate) is a hard upstream constraint and is respected in the fetcher's pacing, not as a perf goal but as a correctness/etiquette requirement (Constitution Principle IV: external service failures handled without exposing raw provider errors).
**Constraints**:

- arXiv API courteous rate: 1 request per 3 seconds; results capped at 30,000 per query, 2,000 per response page.
- Cycle MUST be idempotent (FR-013 dedup, FR-015 deleted-topic skip, FR-016 latest-config) so re-runs after a crash don't produce duplicate attributions.
- Deletion scoping is per (topic, paper); Paper records and other users'/topics' attributions are never touched (FR-006, FR-025).

**Scale/Scope**: Pre-MVP local development. Expected initial: < 100 users, up to ~20 tracked topics per user, daily fetch cadence, dozens of new arXiv papers per topic per cycle (capped, FR-017). Backend adds ~8 endpoints across three resource groups (`/api/topics`, `/api/topics/:id/papers`, `/api/sources`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Fixed Product Stack | PASS | Next.js + TS frontend (no FE changes this iteration), Express + TS backend (extending 001's service), REST, MySQL + Prisma, arXiv as the external source. OpenAI is NOT used in this feature (deferred to MVP #5). |
| II. Layered Backend Architecture | PASS | Controllers (HTTP only), services (`topics.service`, `fetchCycle.service`, `arxiv.service`, `papers.service`), repositories (Prisma in `trackedTopic.repository`, `paper.repository`, `topicPaperMatch.repository`, `fetchCycle.repository`), external client (`external/arxiv.client.ts`), scheduled job (`jobs/fetchCycle.job.ts` → calls service), config (`config/env.ts` + `config/sources.ts`). |
| III. Strict TS + Async Code | PASS | `tsconfig` strict mode, `async/await` throughout, no `any`. `unknown` only at two boundaries: HTTP request bodies (narrowed by Zod) and arXiv XML responses (narrowed by Zod after parse). |
| IV. Isolated External and AI Services | PASS | arXiv access is fully isolated behind `arxiv.service` (high-level) wrapping `external/arxiv.client.ts` (raw HTTP + XML); the scheduler (`jobs/fetchCycle.job.ts`) contains NO business logic and delegates to `fetchCycle.service`. arXiv failures are caught at the service boundary and translated to typed errors; per-source/per-topic failures do not block other topics in the same cycle (FR-014). |
| V. REST, Configuration, and Data Discipline | PASS | Resource-oriented endpoints (`/api/topics`, `/api/topics/:id/papers`, `/api/sources`), meaningful status codes (201 on create, 204 on delete, 409 on duplicate name, 422 on validation failure, etc.), server-side Zod validation, env vars centralized in `backend/src/config/env.ts` (`FETCH_CRON_EXPR`, `ARXIV_BASE_URL`, `MAX_TOPICS_PER_USER`, `MAX_KEYWORDS_PER_TOPIC`, `MAX_FILTERS_PER_TOPIC`, `MAX_NEW_PAPERS_PER_TOPIC_PER_CYCLE`), `.env.example` updated, migrations under `backend/prisma/migrations/0002_tracked_topics/`. |
| Repository Folder Rules | DEVIATION (inherited from 001) | Next.js app remains at repo root rather than `/frontend`. This feature ships backend only, so the deviation has no practical impact on the work delivered here. See **Complexity Tracking**. |
| Implementation Standards | PASS | Controllers do no DB calls. Services take typed inputs (not `Request` objects). Repositories do no HTTP. The scheduled job is safe to re-run (idempotent via FR-013/FR-015/FR-016). Pagination/sorting documented in `contracts/topic-papers.md`. |
| MVP Delivery Order | DEVIATION | MVP order lists #4 (paper storage) before #3 (auto-fetch) and #6 (per-topic list). This feature implements #2 + #3 + #6 and persists a **minimal** Paper model so the fetch pipeline has something to attribute to. Future MVP #4 will extend this Paper schema additively without a destructive migration. Mirrors 001's "favorites-before-#4" precedent (Constitution Check there). See **Complexity Tracking**. |

Both deviations are documented below with rejected simpler alternatives. **Post-Phase-1 re-check**: no further violations introduced by the design — see "Constitution Check (re-check)" at the bottom of this plan.

## Project Structure

### Documentation (this feature)

```text
specs/002-topic-subscription/
├── plan.md                 # This file
├── spec.md                 # Feature specification
├── research.md             # Phase 0 output
├── data-model.md           # Phase 1 output
├── quickstart.md           # Phase 1 output
├── contracts/              # Phase 1 output (one file per REST resource group)
│   ├── topics.md
│   ├── topic-papers.md
│   └── sources.md
├── checklists/
│   └── requirements.md     # Spec quality checklist (from /speckit-specify)
└── tasks.md                # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
backend/                                       # EXTENDED from 001
├── package.json                               # MODIFIED: add node-cron, fast-xml-parser
├── .env.example                               # MODIFIED: add FETCH_CRON_EXPR, ARXIV_BASE_URL, limits
├── prisma/
│   ├── schema.prisma                          # MODIFIED: add TrackedTopic, Paper, TopicPaperMatch, FetchCycle
│   └── migrations/
│       └── 0002_tracked_topics/
│           └── migration.sql                  # NEW
└── src/
    ├── server.ts                              # MODIFIED: mount /api/topics, /api/sources, start scheduler
    ├── config/
    │   ├── env.ts                             # MODIFIED: fetch + limits env vars
    │   └── sources.ts                         # NEW: in-code arXiv source catalog (categories whitelist)
    ├── middleware/
    │   └── authenticate.ts                    # REUSED from 001 (no changes)
    ├── controllers/
    │   ├── topics.controller.ts               # NEW: POST/GET/PATCH/DELETE /api/topics
    │   ├── topic-papers.controller.ts         # NEW: GET /api/topics/:id/papers
    │   └── sources.controller.ts              # NEW: GET /api/sources
    ├── services/
    │   ├── topics.service.ts                  # NEW: TrackedTopic CRUD, per-user limits, name-uniqueness
    │   ├── fetchCycle.service.ts              # NEW: orchestrates one cycle (per-topic incremental + dedupe + cap)
    │   ├── arxiv.service.ts                   # NEW: high-level arXiv query interface
    │   └── papers.service.ts                  # NEW: paper upsert (by sourcePaperId), per-topic listing
    ├── repositories/
    │   ├── trackedTopic.repository.ts         # NEW
    │   ├── paper.repository.ts                # NEW
    │   ├── topicPaperMatch.repository.ts      # NEW
    │   └── fetchCycle.repository.ts           # NEW
    ├── jobs/
    │   └── fetchCycle.job.ts                  # NEW: node-cron wrapper → fetchCycle.service.run()
    ├── external/
    │   └── arxiv.client.ts                    # NEW: raw HTTPS + XML parse; rate-limited token bucket
    ├── validation/
    │   └── schemas.ts                         # MODIFIED: add Zod schemas for topic CRUD bodies
    └── errors.ts                              # MODIFIED: TopicLimitExceeded, DuplicateTopicName,
                                               #           UnknownSourceFilter, UnknownTopic, ...
```

**Frontend additions: none in this iteration.** Frontend integration is deferred. The REST contracts in `contracts/` are the handoff to whoever picks up the FE slice next.

**Structure Decision**: Extend the existing `/backend` service introduced by 001 with new controllers, services, repositories, an external client for arXiv, and a single scheduled job. Database access continues to flow exclusively through Prisma in repository modules; controllers parse, services orchestrate, the scheduler is a thin shell over `fetchCycle.service.run()`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| Next.js app remains at repo root, not `/frontend` | Inherited from 001. Per project memory, the frontend reorg is owned by another teammate and is in progress separately; bundling that move with the topic-subscription backend would conflate unrelated infrastructure churn with a feature delivery. This iteration ships backend only, so the deviation has no functional impact on what is delivered here. | Moving the FE was considered. Rejected because the FE reorg is explicitly outside this feature's scope, and there are no frontend changes in this plan to be affected by the eventual move. |
| Defining a minimal `Paper` model before MVP #4 (paper storage) lands as its own feature | The fetcher must attribute papers to topics (`TopicPaperMatch`), which requires a `Paper` to attribute *to*. Blocking on MVP #4 would prevent shipping MVP #3 and #6, and MVP #4's eventual scope (paper detail page, search/filter) will need a Paper table anyway. This plan persists only the fields the fetcher and per-topic list actually need (title, abstract, authors[], primarySource, sourcePaperId, sourceUrl, publishedAt, fetchedAt); MVP #4 can extend the same table additively (new columns, no destructive migration). | An alternative considered: store no Paper rows, denormalize paper metadata onto `TopicPaperMatch`. Rejected because (a) the same paper attributed to N topics duplicates metadata N times, growing with the per-cycle cap; (b) MVP #5 (summarize abstracts) will require a stable paper identifier and a place to attach summary content — that is what a Paper table provides; (c) the future MVP #4 would then need to migrate denormalized rows into a new table, which is more disruptive than extending a small existing one. Mirrors 001's favorites-before-#4 precedent. |

## Constitution Check (re-check after Phase 1 design)

Re-verified after data-model and contracts are written. No new violations introduced.

- Layered architecture preserved: contracts (HTTP shape) → controllers → services → repositories → Prisma; arXiv access stays in `external/` + `services/arxiv.service.ts`; scheduler stays a thin shell.
- Data discipline preserved: every new table has a Prisma model and a migration; foreign keys are explicit; deletion scoping matches FR-006/FR-025 via cascading deletes only along the topic-owned edges (`TrackedTopic → TopicPaperMatch`), never on the `Paper` edge.
- No `any`; `unknown` only at HTTP body and arXiv response boundaries, both narrowed by Zod schemas defined in `validation/schemas.ts`.
- Endpoints are resource-oriented; status codes documented per endpoint in `contracts/`.
- Operator-facing fetch-cycle behavior (cron expression, cadence) is controlled by environment variables, not embedded in code.
