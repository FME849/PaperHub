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

**Language/Version**: TypeScript for Next.js frontend and Express.js backend
**Primary Dependencies**: Next.js, Express.js, Prisma, MySQL, OpenAI API, arXiv API
**Storage**: MySQL with Prisma models and migrations
**Testing**: [Specify unit/integration/manual validation approach for this feature]
**Target Platform**: Web application
**Project Type**: Web app with separate frontend and backend
**Performance Goals**: Optimize only for measured problems or explicit user-facing requirements
**Constraints**: Fixed product stack; REST only; backend-owned AI interactions; backend-owned scheduled fetching jobs; arXiv as the external paper source
**Scale/Scope**: MVP paper tracking and summarization by topic

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Fixed Stack: Does the plan use Next.js and TypeScript for the frontend,
  Express.js and TypeScript for the backend, REST APIs, MySQL, Prisma,
  OpenAI API, and arXiv API?
- MVP Order: Is this feature the next allowed MVP feature, or is there explicit
  approval to work outside the nine-feature MVP sequence?
- Folder Rules: Does the plan keep UI in `/frontend`, API/service/repository
  code in `/backend`, Spec Kit artifacts in `/specs`, and reports in `/docs`?
- Backend Layering: Are controllers limited to request/response concerns,
  services responsible for business logic, repositories responsible for Prisma
  database access, and external APIs isolated behind services?
- Async and TypeScript: Is strict TypeScript preserved and are asynchronous
  flows expressed with `async`/`await`?
- Frontend Quality: Do backend-calling screens include loading states, error
  states, and appropriate authentication handling?
- External Services: Are arXiv and OpenAI calls handled only by backend
  services with user-safe failure behavior?
- Configuration: Are environment variables centralized, secrets environment-only,
  and `.env.example` updates planned when configuration changes?
- Data/API/Scheduler: Are REST resource names, meaningful HTTP status codes,
  MySQL migrations, Prisma models, repository database access, and backend
  scheduled jobs covered where applicable?

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
backend/
├── src/
│   ├── controllers/
│   ├── services/
│   ├── repositories/
│   ├── external/
│   ├── jobs/
│   ├── config/
│   └── server.ts
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── tests/

frontend/
├── src/
│   ├── pages/ or app/
│   ├── components/
│   ├── screens/
│   ├── lib/
│   └── hooks/
└── tests/

docs/
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
