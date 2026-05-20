# Phase 1 Data Model: Tracked Research Topics

**Branch**: `002-topic-subscription` | **Date**: 2026-05-18 | **Plan**: [plan.md](./plan.md)

This document describes the new and modified Prisma models for this feature, along with constraints, indexes, validation rules, and deletion semantics. All schema changes ship as a single additive migration: `backend/prisma/migrations/0002_tracked_topics/`. The existing `User` model from 001 is **not** modified, only referenced.

---

## Entity Overview

```text
User (existing, 001)
  └── TrackedTopic (1:N, cascade on user delete)
        └── TopicPaperMatch (1:N, cascade on topic delete)
              └── Paper (N:1, RESTRICT — papers outlive topics; never cascade-deleted)

FetchCycle (system-internal; loosely referenced by TopicPaperMatch.cycleId)
```

**Deletion semantics** (anchored to spec FR-006, FR-018, FR-025, Edge Cases):

- Deleting a `TrackedTopic` cascades to its `TopicPaperMatch` rows — and **only those**.
- Deleting a `User` cascades to that user's `TrackedTopic` rows, which in turn cascade to their `TopicPaperMatch` rows.
- `Paper` rows are **never** cascade-deleted by this feature. They are shared catalog citizens; the deletion of any number of topics or users can leave a `Paper` row with zero attributions, and that is by design (FR-027 in the Edge Cases section).
- Other users' / other topics' `TopicPaperMatch` rows referencing the same `Paper` are unaffected by any one user's or topic's deletion.

---

## Model: `TrackedTopic`

A user-owned research watch.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `String` (cuid) | PK | |
| `userId` | `String` | FK → `User.id` ON DELETE CASCADE; indexed | (FR-025) |
| `name` | `String` (VARCHAR(120)) | NOT NULL; trimmed; non-empty | (FR-002, Decision 7) |
| `nameLower` | `String` (VARCHAR(120)) | NOT NULL; UNIQUE with `userId` | Normalized for case-insensitive per-user uniqueness (FR-003). Set by service on insert/update from `name.trim().toLowerCase()`. |
| `keywords` | `Json` | NOT NULL; array of strings, length 1–`MAX_KEYWORDS_PER_TOPIC`, each non-empty and ≤ `MAX_KEYWORD_LENGTH` | (FR-009, FR-011) |
| `sourceFilters` | `Json` | NOT NULL; array of strings (e.g., `"arxiv:cs.AI"`), length 1–`MAX_FILTERS_PER_TOPIC`, each matching the SOURCES catalog | (FR-010, FR-011) |
| `lastFetchedAt` | `DateTime?` | nullable | Updated on per-topic successful fetch (Decision 5). `null` until the topic's first successful cycle. |
| `createdAt` | `DateTime` | default `now()` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |

**Indexes / constraints**:

- `@@unique([userId, nameLower])` — per-user case-insensitive name uniqueness (FR-003).
- `@@index([userId])` — list-by-user queries.
- `@@index([lastFetchedAt])` — secondary; useful when the scheduler picks "topics needing fetch" if we ever add per-topic cadence.

**Validation (service-level, before persistence)**:

- `name`: trimmed; non-empty; ≤ `MAX_TOPIC_NAME_LENGTH` (default 120) characters; rejected with `422` if violated.
- `nameLower`: computed `name.trim().toLowerCase()`; uniqueness checked at the DB constraint level — duplicate insert returns `409 DuplicateTopicName`.
- `keywords`: each entry trimmed; rejected if any entry is empty after trim, exceeds `MAX_KEYWORD_LENGTH` (default 80), or the array is empty or longer than `MAX_KEYWORDS_PER_TOPIC` (default 15). Duplicates within the same array are de-duped (case-sensitive) before persistence.
- `sourceFilters`: each entry must match `^arxiv:[a-z][a-z0-9_\-]*(\.[A-Z][A-Za-z0-9_\-]+)?$` AND be present in `SOURCES.arxiv.filterValues` (Decision 6). Length 1–`MAX_FILTERS_PER_TOPIC` (default 10). Unknown values rejected with `422 UnknownSourceFilter`.
- **Per-user cap**: before insert, the service checks `count(TrackedTopic WHERE userId = req.userId) < MAX_TOPICS_PER_USER` (default 20); rejected with `409 TopicLimitExceeded` if equal.

**State transitions**: `created` → (`edited` ↔ `edited`) → `deleted` (hard delete, terminal). No status column.

---

## Model: `Paper`

The minimal paper record this feature persists. Designed to be additively extended by the future MVP #4 (paper storage) feature without a destructive migration. (Plan Complexity Tracking row 2.)

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `String` (cuid) | PK | Internal stable identifier. |
| `primarySource` | `String` (VARCHAR(32)) | NOT NULL | For v1 always `"arxiv"` (Decision 1). |
| `sourcePaperId` | `String` (VARCHAR(64)) | NOT NULL | Source-native paper identifier. For arXiv: version-stripped ID (e.g., `2403.04102`) (Decision 8). |
| `title` | `String` (TEXT) | NOT NULL | |
| `abstract` | `String` (TEXT) | NOT NULL | |
| `authors` | `Json` | NOT NULL | Ordered array of strings (Decision 9). |
| `sourceUrl` | `String` (VARCHAR(512)) | NOT NULL | Canonical abstract page URL (e.g., `https://arxiv.org/abs/2403.04102`). |
| `publishedAt` | `DateTime` | NOT NULL | Source-reported publication / submission date. |
| `firstFetchedAt` | `DateTime` | default `now()` | When this row was first created in our DB. |

**Indexes / constraints**:

- `@@unique([primarySource, sourcePaperId])` — Decision 8 dedup key. Upserts in `papers.service.upsertFromArxiv()` rely on this.
- `@@index([publishedAt])` — supports reverse-chronological per-topic listing (FR-021) via the join from `TopicPaperMatch`.

**Validation (service-level, before persistence)**:

- `primarySource`: must equal `"arxiv"` for v1; other sources rejected as unsupported.
- `sourcePaperId`: for `primarySource = "arxiv"`, must match `^\d{4}\.\d{4,5}$` (modern arXiv ID format). Any trailing version suffix (e.g., `v2`) is stripped by `arxiv.service` before reaching the repository.
- `title`, `abstract`: trimmed; non-empty after trim. Long values are accepted as-is (TEXT column).
- `authors`: array of trimmed non-empty strings.
- `sourceUrl`: must parse as a valid `https://` URL.

**State transitions**: created → (never updated by this feature in v1; future #4 may add an updater). No deletion in this feature.

**No update path in v1**: if arXiv reissues a paper (v2, v3, …), the version-stripped `sourcePaperId` is unchanged, the upsert is a no-op, and we keep the original metadata. A follow-up can add metadata-refresh logic when MVP #4 ships.

---

## Model: `TopicPaperMatch`

The attribution: "the fetcher discovered this paper for this tracked topic in some cycle."

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `String` (cuid) | PK | |
| `trackedTopicId` | `String` | FK → `TrackedTopic.id` ON DELETE CASCADE; indexed | (FR-006: deleting topic removes only this topic's attributions.) |
| `paperId` | `String` | FK → `Paper.id` ON DELETE RESTRICT | We never delete papers from this feature; the RESTRICT is defense-in-depth. |
| `fetchedAt` | `DateTime` | default `now()` | When this attribution was created. |
| `cycleId` | `String?` | FK → `FetchCycle.id` ON DELETE SET NULL; nullable | Soft link for diagnostics. NULL if a `FetchCycle` row is later pruned. |

**Indexes / constraints**:

- `@@unique([trackedTopicId, paperId])` — **enforces FR-013 at the schema layer**. Re-running a cycle can never produce a duplicate attribution; the DB rejects the second insert. The service catches the unique-constraint violation and treats it as "already attributed, skip."
- `@@index([trackedTopicId, fetchedAt(sort: Desc)])` — supports the per-topic paper listing (FR-021) joined to `Paper` and sorted by `Paper.publishedAt` desc OR `fetchedAt` desc depending on view.
- `@@index([paperId])` — supports the inverse query "which topics is this paper attributed to" (used by future cross-topic features; not exposed in v1 REST).

**Validation (service-level, before persistence)**:

- `trackedTopicId` and `paperId` are FKs; the service verifies the topic still exists and belongs to the running user before the attribution write inside the cycle (FR-015 deleted-mid-fetch protection — Decision 5 mid-fetch transactional check).

**Deletion**: cascading from `TrackedTopic` only. Never cascades from `Paper`. Never touches other rows.

---

## Model: `FetchCycle` (system-internal)

A row per scheduled fetch cycle. Used for diagnostics (FR-024) and crash recovery (Decision 12).

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `String` (cuid) | PK | |
| `startedAt` | `DateTime` | default `now()` | |
| `finishedAt` | `DateTime?` | nullable until terminal status | |
| `status` | `Enum FetchCycleStatus` | NOT NULL | `RUNNING` (initial), `SUCCEEDED`, `FAILED`, `PARTIAL`. |
| `stats` | `Json` | NOT NULL default `{}` | Per-source success/failure counts and per-topic match counts. Example: `{"sources": {"arxiv": {"ok": 18, "fail": 2}}, "topics": {"matched": 18, "skipped": 2, "newMatches": 73}}`. |

**Indexes**:

- `@@index([startedAt(sort: Desc)])` — most recent cycles first for operator queries.
- `@@index([status])` — "any cycles still RUNNING?" recovery query at startup.

**State transitions**: `RUNNING` → `SUCCEEDED` | `FAILED` | `PARTIAL` (terminal). On process startup, any `RUNNING` row from a prior crash is updated to `FAILED` with a note in `stats.recoveryAction = "promoted-from-running-on-startup"`.

**Not exposed via REST in v1.** Operators query directly. A future operator UI can expose it.

---

## Prisma schema sketch

```prisma
// backend/prisma/schema.prisma (additions)

model TrackedTopic {
  id             String   @id @default(cuid())
  userId         String
  name           String   @db.VarChar(120)
  nameLower      String   @db.VarChar(120)
  keywords       Json
  sourceFilters  Json
  lastFetchedAt  DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user           User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  matches        TopicPaperMatch[]

  @@unique([userId, nameLower])
  @@index([userId])
  @@index([lastFetchedAt])
}

model Paper {
  id              String   @id @default(cuid())
  primarySource   String   @db.VarChar(32)
  sourcePaperId   String   @db.VarChar(64)
  title           String   @db.Text
  abstract        String   @db.Text
  authors         Json
  sourceUrl       String   @db.VarChar(512)
  publishedAt     DateTime
  firstFetchedAt  DateTime @default(now())

  matches         TopicPaperMatch[]

  @@unique([primarySource, sourcePaperId])
  @@index([publishedAt])
}

model TopicPaperMatch {
  id              String      @id @default(cuid())
  trackedTopicId  String
  paperId         String
  fetchedAt       DateTime    @default(now())
  cycleId         String?

  trackedTopic    TrackedTopic @relation(fields: [trackedTopicId], references: [id], onDelete: Cascade)
  paper           Paper        @relation(fields: [paperId], references: [id], onDelete: Restrict)
  cycle           FetchCycle?  @relation(fields: [cycleId], references: [id], onDelete: SetNull)

  @@unique([trackedTopicId, paperId])
  @@index([trackedTopicId, fetchedAt(sort: Desc)])
  @@index([paperId])
}

enum FetchCycleStatus {
  RUNNING
  SUCCEEDED
  FAILED
  PARTIAL
}

model FetchCycle {
  id          String           @id @default(cuid())
  startedAt   DateTime         @default(now())
  finishedAt  DateTime?
  status      FetchCycleStatus @default(RUNNING)
  stats       Json             @default("{}")

  matches     TopicPaperMatch[]

  @@index([startedAt(sort: Desc)])
  @@index([status])
}
```

The existing `User` model from 001 gains a reverse relation (one line addition):

```prisma
model User {
  // ... existing 001 fields ...
  trackedTopics  TrackedTopic[]
}
```

---

## Migration: `0002_tracked_topics`

Single additive migration. No existing 001 data is touched. Key SQL (Prisma-generated):

- `CREATE TABLE TrackedTopic` with the schema above, FK to `User(id)` ON DELETE CASCADE.
- `CREATE TABLE Paper` with the unique index on `(primarySource, sourcePaperId)`.
- `CREATE TABLE TopicPaperMatch` with FKs and the unique index on `(trackedTopicId, paperId)`.
- `CREATE TABLE FetchCycle` and the `FetchCycleStatus` enum (in MySQL, an enum column).
- All indexes documented above.

**Rollback**: drop the four new tables in reverse FK order (`TopicPaperMatch` → `Paper` → `TrackedTopic` → `FetchCycle`); no 001 data lost.

---

## Cross-references to Spec

| Spec item | Enforced by |
|-----------|-------------|
| FR-002 (non-empty fields) | Service-level Zod validation + DB NOT NULL |
| FR-003 (per-user case-insensitive name uniqueness) | `@@unique([userId, nameLower])` |
| FR-006 (delete topic scope) | `TopicPaperMatch.trackedTopicId` ON DELETE CASCADE; `Paper` untouched |
| FR-010 (recognized source filters) | Service-level validation against `config/sources.ts` |
| FR-011 (per-user / per-topic limits) | Service-level checks with env-var-driven defaults |
| FR-013 (no duplicate attributions) | `@@unique([trackedTopicId, paperId])` |
| FR-014 (per-source failure isolation) | Service-level try/catch per topic; `topic.lastFetchedAt` not updated on failure |
| FR-015 (no fetch for deleted topic) | Service re-checks topic existence inside the per-topic transaction |
| FR-016 (latest config at cycle start) | Cycle reads `TrackedTopic` rows at start of cycle |
| FR-017 (per-topic per-cycle cap) | Service-level slice of fetched papers to `MAX_NEW_PAPERS_PER_TOPIC_PER_CYCLE` |
| FR-018 (incremental window) | `TrackedTopic.lastFetchedAt` + per-cycle query window |
| FR-019 (no backfill) | First cycle uses `cycleStart - cadenceInterval` floor; no historical sweep |
| FR-024 (diagnostics) | `FetchCycle.stats` JSON |
| FR-025 (account delete scope) | `User → TrackedTopic` ON DELETE CASCADE → `TopicPaperMatch` ON DELETE CASCADE; `Paper` ON DELETE RESTRICT |
