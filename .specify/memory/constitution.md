<!--
Sync Impact Report
Version change: template -> 1.0.0
Modified principles:
- Template principle 1 -> I. Fixed MVP Stack
- Template principle 2 -> II. Correctness Before Optimization
- Template principle 3 -> III. Strict TypeScript and Readable Code
- Template principle 4 -> IV. Resilient External Integrations
- Template principle 5 -> V. Secure, Observable REST Workflows
Added sections:
- Mission and Product Scope
- Technology and Architecture Constraints
- Implementation Standards
- Data, API, and Scheduler Rules
- MVP Delivery Order
Removed sections:
- Placeholder Section 2
- Placeholder Section 3
Templates requiring updates:
- ✅ .specify/templates/plan-template.md
- ✅ .specify/templates/spec-template.md
- ✅ .specify/templates/tasks-template.md
- ✅ .specify/templates/commands/*.md (directory absent; no update required)
- ✅ AGENTS.md (already delegates to current plan; no change required)
Follow-up TODOs:
- None
-->

# Paper Hub Constitution

## Mission and Product Scope

Paper Hub is a web application that helps users track and summarize new
scientific papers by topic. The project MUST prioritize correctness,
simplicity, readability, and a clean user experience over premature
optimization, broad integrations, or architecture that is not needed for the
MVP.

Paper Hub is an academic project. Implementations MUST avoid gold-plating,
over-engineering, and advanced features until the complete MVP scope is working
and manually tested.

## Core Principles

### I. Fixed MVP Stack

The application MUST use Next.js App Router, TypeScript, and Tailwind CSS for
the frontend; NestJS and TypeScript for the backend; PostgreSQL with TypeORM
for persistence; JWT authentication with 15-minute access tokens and 7-day
refresh tokens; Anthropic Claude API using `claude-sonnet-4-20250514` for
summarization; arXiv API as the only paper source; and `@nestjs/schedule` for
background jobs.

Implementations MUST NOT introduce Bull, BullMQ, Redis, Celery, GraphQL,
WebSockets, Docker, CI/CD configuration, third-party UI component libraries, or
additional paper sources unless explicitly requested after the MVP is complete.
This fixed stack keeps the project teachable, maintainable, and aligned with
the academic MVP goal.

### II. Correctness Before Optimization

Every feature MUST work as specified before performance optimization begins.
When tradeoffs arise, project priority order is correctness, simplicity,
readability, then performance. Performance work MUST be tied to a measured
problem or a concrete user-facing requirement.

Advanced features, including recommendations, duplicate detection, trend
statistics, paper scoring, real-time updates, and PDF storage, MUST NOT begin
until all nine MVP features are complete and manually tested. This keeps effort
focused on the smallest useful product.

### III. Strict TypeScript and Readable Code

All TypeScript code MUST be strictly typed. `any` is prohibited. `unknown` MAY
be used only when a short comment explains the boundary being handled and the
code narrows it before use. Every public class and public method MUST have a
JSDoc comment.

Functions MUST stay at 40 lines or fewer, and nesting depth MUST stay at three
levels or fewer. Code MUST prefer early returns, small components and services,
constants or enums for repeated values, and explicit names over cleverness.
These limits make the code easier to review and maintain in an academic
project.

### IV. Resilient External Integrations

arXiv fetches MUST retry timeout and 5xx failures up to three times with
exponential backoff delays of 1 second, 2 seconds, and 4 seconds. arXiv 4xx
errors MUST be logged, the current fetch cycle MUST be skipped, and the
scheduler MUST continue running. If a topic fetch fails after retries, the
topic MUST record `last_fetch_error` with a timestamp and reason, and remaining
topics MUST continue.

Paper ingestion MUST save papers before summarization. Anthropic failures MUST
set `summary` to `null` and `summary_status` to `failed`; the UI MUST display
"Summary not available" or an equivalent localized message. Summarization MUST
NOT be retried inline, and Anthropic failures MUST NOT block paper ingestion. A
scheduled job MUST retry failed summaries once per day.

### V. Secure, Observable REST Workflows

All backend input MUST be validated and sanitized regardless of frontend
validation. Secrets including `DATABASE_URL`, `JWT_SECRET`, and
`ANTHROPIC_API_KEY` MUST come from environment variables, `.env` files MUST NOT
be committed, `.env.example` MUST be maintained, and `JWT_SECRET` MUST be at
least 32 characters.

The API MUST be RESTful under `/api/v1/`, use plural nouns without verbs in
URLs, and return meaningful HTTP status codes. Every endpoint MUST use Swagger
decorators. Every API call in the frontend MUST expose loading and error
states; network errors MUST show a toast, and 401 responses MUST clear local
auth state and redirect to login. Scheduler jobs MUST log start time, end time,
and item counts, and MUST prevent overlapping runs with a simple database lock.

## Technology and Architecture Constraints

Backend code MUST follow NestJS module structure: module, controller, service,
repository. Controllers MUST handle HTTP concerns only. Services MUST contain
business logic and wrap database operations in try/catch blocks. Controllers
MUST NOT query the database directly. Incoming request bodies MUST use DTOs
with `class-validator`, outgoing response shapes MUST use `class-transformer`,
and entities MUST use TypeORM decorators. Raw SQL MUST be avoided unless no
TypeORM alternative can express the required operation clearly.

Frontend code MUST use App Router only. Components MUST be functional
components with hooks, Server Components MUST be the default, and `'use client'`
MUST be used only for interactivity or browser APIs. TanStack Query MUST manage
server state, React Hook Form MUST manage forms, and styling MUST use Tailwind
utility classes with no inline styles. User-facing text on each page MUST use
Vietnamese or English consistently, without mixing languages on the same page.

Authentication MUST use JWT access tokens that expire after 15 minutes and
refresh tokens that expire after 7 days. Login and registration endpoints MUST
be rate limited to 10 requests per minute per IP.

## Implementation Standards

Database table names MUST be snake_case plurals. Column names MUST be
snake_case. Every table MUST include `id` as a UUID plus `created_at` and
`updated_at`. User-facing data, including topics and saved papers, MUST use
soft deletes through `deleted_at`; hard deletes are allowed only for internal or
temporary records. Every foreign key MUST have an index.

Paginated list endpoints MUST return
`{ data: [], total: number, page: number, limit: number }`. Default page size
MUST be 20, and maximum page size MUST be 100.

Backend errors MUST NOT expose raw database errors or stack traces to clients.
Expected status codes are 400 for bad input, 401 for unauthenticated requests,
403 for unauthorized requests, 404 for missing resources, and 500 for
unexpected server errors.

## Data, API, and Scheduler Rules

Paper records MUST store metadata and links only: title, abstract, authors,
published date, and link. PDF files MUST NOT be stored.

The paper fetch scheduler MUST run every 6 hours. The failed-summary retry
scheduler MUST run once per day at 2:00 AM. Scheduler jobs MUST use an
`is_running` boolean on a jobs table or an equivalent simple database lock to
prevent concurrent runs.

REST endpoints MUST use plural nouns and no verbs in URLs, such as
`GET /api/v1/papers`, `POST /api/v1/topics`, and
`DELETE /api/v1/topics/:id`. Endpoints such as `GET /getPapers` and
`POST /createTopic` are prohibited.

## MVP Delivery Order

The MVP consists of these nine core features, delivered in order:

1. User registration and login with JWT authentication.
2. Add, edit, and delete topics.
3. Auto-fetch papers from arXiv by topic.
4. Store paper metadata: title, abstract, authors, published date, and link.
5. Summarize paper abstracts using the Anthropic API.
6. Display a list of new papers per topic.
7. Search and filter papers by keyword or topic.
8. View paper detail.
9. Save paper to favorites.

No advanced feature MAY start until all nine MVP features are complete and
manually tested.

## Governance

This constitution supersedes conflicting project guidance. Feature specs,
implementation plans, generated tasks, code reviews, and manual validation MUST
check compliance with the principles and constraints in this document.

Amendments MUST update this file, include a Sync Impact Report, and propagate
required changes to spec-kit templates and runtime guidance. Amendments require
an explicit user instruction or approval. The version MUST follow semantic
versioning: MAJOR for incompatible governance or principle redefinitions, MINOR
for new principles or materially expanded sections, and PATCH for clarifying
wording that does not change obligations.

Compliance review MUST happen during planning before implementation and again
before a feature is considered complete. Any violation MUST be documented in
the implementation plan with the reason, the simpler compliant alternative that
was considered, and explicit user approval.

**Version**: 1.0.0 | **Ratified**: 2026-05-09 | **Last Amended**: 2026-05-09
