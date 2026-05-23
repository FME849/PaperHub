<!--
Sync Impact Report
Version change: 2.0.0 -> 2.1.0
Modified principles:
- I. Fixed Product Stack -> generalized: AI integration is now provider-agnostic
  (MUST be isolated behind a backend service); the previously named "OpenAI API"
  obligation is moved to Implementation Standards as the v1 default selection,
  which is now Google Gemini (chosen for free-tier availability).
Modified sections:
- Implementation Standards -> added "Default AI Provider Selection" subsection
  naming Gemini as the v1 default, with operator override via environment vars.
Templates requiring updates:
- ✅ .specify/templates/plan-template.md (no AI-provider references; OK)
- ✅ .specify/templates/spec-template.md (no AI-provider references; OK)
- ✅ .specify/templates/tasks-template.md (no AI-provider references; OK)
- ✅ specs/003-paper-summary-search/* (updated to Gemini in plan/research/quickstart)
- ⚠ specs/001-user-auth/* (no AI usage; no change required)
- ⚠ specs/002-topic-subscription/* (no AI usage; no change required)
Follow-up TODOs:
- None
-->

# Paper Hub Constitution

## Mission and Product Scope

Paper Hub is a web application that helps users track, discover, and summarize
scientific papers from arXiv. The project MUST prioritize a clear MVP, readable
TypeScript, service-oriented design, and maintainable separation between the UI,
API, data access, scheduled jobs, and external integrations.

Paper Hub implementations MUST avoid hidden coupling between frontend and
backend code. Backend services own business behavior, AI interactions, arXiv
access, scheduled fetching, and persistence. Frontend code owns the user
experience and communicates with the backend through REST APIs.

## Core Principles

### I. Fixed Product Stack

The frontend MUST use Next.js and TypeScript. The backend MUST use Express.js
and TypeScript. The API MUST be REST. Persistence MUST use MySQL with Prisma
and MySQL migrations. AI integration MUST be isolated behind a backend service
(the specific provider is chosen per feature and may evolve — see Implementation
Standards for the v1 default). arXiv MUST be the external paper source.

This stack keeps the project small enough to reason about while still matching
the product needs: a web UI, a typed REST backend, relational persistence,
scheduled paper fetching, and backend-owned AI summarization.

### II. Layered Backend Architecture

Backend code MUST separate controllers, services, repositories, external API
clients, scheduled jobs, and configuration. Controllers MUST only handle HTTP
request parsing, response shaping, and status codes. Services MUST contain
business logic and coordinate repositories or external services. Repositories
MUST contain database access. External APIs, including arXiv and OpenAI, MUST be
isolated behind services.

This layering makes behavior testable, keeps database and network details out
of controllers, and prevents product rules from being duplicated across routes.

### III. Strict TypeScript and Async Code

All frontend and backend TypeScript MUST run in strict mode. New code MUST use
`async` and `await` for asynchronous control flow. `any` is prohibited.
`unknown` MAY be used only at input boundaries and MUST be narrowed before use.

Code MUST prefer explicit names, small functions, early returns, and
service-oriented design. These rules keep the academic MVP readable and reduce
the risk of hidden runtime behavior.

### IV. Isolated External and AI Services

The backend MUST handle all AI interactions and all scheduled fetching jobs.
arXiv access MUST be isolated in an external-source service. OpenAI access MUST
be isolated in an AI service. Scheduled fetching MUST call backend services
rather than embedding business logic in scheduler code.

External service failures MUST be handled without exposing raw provider errors
to users. The backend MUST record enough context to diagnose failed arXiv or
OpenAI operations while allowing unrelated application workflows to continue
where practical.

### V. REST, Configuration, and Data Discipline

REST endpoints MUST use resource-oriented names and meaningful HTTP status
codes. Backend input MUST be validated before business logic runs. Raw internal
errors, database errors, and provider errors MUST NOT be exposed to clients.

All environment variables MUST be centralized in backend configuration. Secrets
MUST come from environment variables, `.env` files MUST NOT be committed, and
`.env.example` MUST be maintained when configuration changes. MySQL schema
changes MUST be represented by migrations. Database access MUST go through
Prisma from repository code.

## Repository Folder Rules

The repository MUST keep top-level product areas separated:

- `/frontend` contains the Next.js user interface.
- `/backend` contains the Express.js REST API, services, repositories,
  scheduled jobs, and external integrations.
- `/specs` contains Spec Kit product and feature artifacts.
- `/docs` contains reports and supporting documentation.

Feature plans and generated tasks MUST use these folders unless an explicit
user-approved exception is documented in the plan.

## Implementation Standards

Backend controllers MUST NOT query the database directly. Services MUST NOT
embed raw HTTP request or response objects as business inputs. Repositories
MUST NOT call external network APIs. Scheduled jobs MUST delegate to services
and MUST be safe to run repeatedly.

Frontend code MUST communicate with the backend through REST APIs. Frontend
screens that call the backend MUST provide loading and error states. Protected
or authenticated workflows MUST handle unauthorized responses by returning the
user to an appropriate authentication flow.

Database tables and fields MUST follow one consistent naming convention per
migration. Relationship fields and foreign keys MUST be represented in Prisma
models. Pagination, filtering, and sorting behavior MUST be documented in API
contracts for list endpoints.

### Default AI Provider Selection

The v1 default AI provider is **Google Gemini**, accessed via the official Node
SDK. The choice MUST be operator-configurable through environment variables so
the provider can be swapped without code changes. Switching providers (for
example to OpenAI, Anthropic, or a self-hosted model) MUST be documented in the
feature plan and MUST preserve the isolation requirement in Principle IV: the
swap MUST happen entirely inside the `external/` client and the AI service that
wraps it, with no provider-specific types leaking into controllers,
repositories, or other services.

## MVP Delivery Order

The MVP consists of these core features, delivered in order unless the user
explicitly approves a different sequence:

1. User registration and login.
2. Add, edit, and delete topics.
3. Auto-fetch papers from arXiv by topic.
4. Store paper metadata: title, abstract, authors, published date, and link.
5. Summarize paper abstracts using the OpenAI API.
6. Display a list of new papers per topic.
7. Search and filter papers by keyword or topic.
8. View paper detail.
9. Save paper to favorites.

No advanced feature MAY start until the MVP feature it depends on is complete
and manually validated.

## Governance

This constitution supersedes conflicting project guidance. Feature specs,
implementation plans, generated tasks, code reviews, and manual validation MUST
check compliance with the principles and constraints in this document.

Amendments MUST update this file, include a Sync Impact Report, and propagate
required changes to Spec Kit templates and runtime guidance. Amendments require
an explicit user instruction or approval. The version MUST follow semantic
versioning: MAJOR for incompatible governance or principle redefinitions, MINOR
for new principles or materially expanded sections, and PATCH for clarifying
wording that does not change obligations.

Compliance review MUST happen during planning before implementation and again
before a feature is considered complete. Any violation MUST be documented in
the implementation plan with the reason, the simpler compliant alternative that
was considered, and explicit user approval.

**Version**: 2.1.0 | **Ratified**: 2026-05-09 | **Last Amended**: 2026-05-23
