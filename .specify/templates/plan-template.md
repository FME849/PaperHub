# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript for Next.js App Router frontend and NestJS backend
**Primary Dependencies**: Next.js, Tailwind CSS, NestJS, TypeORM, PostgreSQL, JWT, Anthropic Claude API, arXiv API, `@nestjs/schedule`
**Storage**: PostgreSQL with TypeORM entities and migrations
**Testing**: [Specify unit/integration/manual validation approach for this feature]
**Target Platform**: Web application
**Project Type**: Web app with separate frontend and backend
**Performance Goals**: Optimize only for measured problems or explicit user-facing requirements
**Constraints**: Fixed MVP stack; REST only; arXiv only; no queue, GraphQL, WebSockets, Docker, CI/CD, PDF storage, or third-party UI component library unless explicitly requested
**Scale/Scope**: MVP paper tracking and summarization by topic

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Fixed Stack: Does the plan use Next.js App Router, TypeScript, Tailwind CSS,
  NestJS, PostgreSQL/TypeORM, JWT, Anthropic Claude
  `claude-sonnet-4-20250514`, arXiv only, and `@nestjs/schedule`?
- MVP Order: Is this feature the next allowed MVP feature, or is there explicit
  approval to work outside the nine-feature MVP sequence?
- Simplicity: Is the design the boring, obvious solution with no queue,
  GraphQL, WebSockets, Docker, CI/CD, PDF storage, advanced feature, or
  third-party UI component library?
- Backend Quality: Are controllers HTTP-only, services business-logic-only,
  DTO validation present, response transformation planned, Swagger decorators
  included, and database access isolated from controllers?
- Frontend Quality: Are Server Components the default, client components
  justified, TanStack Query used for server state, React Hook Form used for
  forms, Tailwind used for styling, and one UI language chosen per page?
- Resilience: Are arXiv retry/skip rules, Anthropic non-blocking failure rules,
  database error handling, frontend loading/error states, and auth redirects
  covered where applicable?
- Security: Are secrets environment-only, `.env.example` maintained, JWT secret
  length enforced, backend validation included, and auth rate limits planned?
- Data/API/Scheduler: Are snake_case database conventions, indexed foreign keys,
  soft deletes, `/api/v1/` REST conventions, pagination shape, scheduler timing,
  logging, and non-overlap locking covered where applicable?

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

backend/
├── src/
│   ├── modules/
│   ├── common/
│   └── main.ts
└── tests/

frontend/
├── app/
├── components/
├── lib/
├── hooks/
└── tests/
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
