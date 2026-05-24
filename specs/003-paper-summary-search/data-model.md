# Phase 1 Data Model: Paper Reading Experience

**Branch**: `003-paper-summary-search` | **Date**: 2026-05-23 | **Plan**: [plan.md](./plan.md)

This document describes the new and modified Prisma models for this feature, along with constraints, indexes, validation rules, and the existing tables that this feature reads (without modifying). All schema changes ship as a single additive migration: `backend/prisma/migrations/0003_paper_summaries/`.

---

## Entity Overview

```text
User (existing, 001) ──┬── Favorite (existing, 001) ─── (Paper via paperId; reused — no schema change)
                       └── TrackedTopic (existing, 002) ─── TopicPaperMatch ─── Paper ─── PaperSummary (NEW, 1:1)
```

**What changes in this feature:**

- **NEW** `PaperSummary` table (one row per `Paper`, status-aware).
- **NEW** `FULLTEXT` index on `Paper(title, abstract)` for search relevance (Decision 8).
- **NO change** to `Favorite`, `User`, `TrackedTopic`, `Paper`, `TopicPaperMatch`, `FetchCycle`. `Favorite.paperId` (VARCHAR(64)) is now interpreted as the catalog's `Paper.id` cuid value; the column already supports this without alteration.

---

## Model: `PaperSummary`

The persisted bullet-point summary for one paper. Exactly one row per paper.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `String` (cuid) | PK | |
| `paperId` | `String` | FK → `Paper.id` ON DELETE CASCADE; **UNIQUE** | Enforces FR-013 at the schema layer (one summary per paper). Deleting a `Paper` row (which this feature does not do) cascades to its summary. |
| `bullets` | `Json` | NOT NULL | Ordered array of strings (3–5 bullets per Decision 3). Empty array allowed only when `status != SUCCEEDED` (service-level invariant). |
| `status` | `Enum PaperSummaryStatus` | NOT NULL | `SUCCEEDED`, `PENDING_RETRY`, `NOT_SUMMARISABLE`. |
| `model` | `String` (VARCHAR(64))? | nullable | The AI model used when `status = SUCCEEDED` (e.g., `"gemini-2.0-flash"`). Useful for future regeneration / migration / provider swap. Null for non-`SUCCEEDED` rows. |
| `failureReason` | `String` (VARCHAR(255))? | nullable | Short reason when `status = NOT_SUMMARISABLE` (e.g., `"empty_abstract"`, `"abstract_too_long"`, `"malformed_ai_response"`). Null otherwise. |
| `generatedAt` | `DateTime?` | nullable | Set to `now()` when `status` becomes `SUCCEEDED`. Null otherwise. |
| `createdAt` | `DateTime` | default `now()` | Row creation timestamp (covers `PENDING_RETRY` and `NOT_SUMMARISABLE` initial state). |
| `updatedAt` | `DateTime` | `@updatedAt` | |

**Indexes / constraints**:

- `@@unique([paperId])` — **enforces FR-013 / FR-014 at the schema layer**. Concurrent summarisation attempts for the same paper race at the database; the second `INSERT` hits P2002 and is handled by `summaries.service` as "already summarised."
- `@@index([status])` — secondary; supports operator queries like "how many papers are pending retry?"

**Validation (service-level, before persistence)**:

- `bullets`: array of trimmed non-empty strings. Length must be in `[3, 5]` when `status = SUCCEEDED`. Each bullet should be ≤ 25 words (soft guideline from prompt; not enforced server-side). Re-parsed from the AI service's JSON response through a Zod schema.
- `status`: state-machine — see "State transitions" below. Direct service writes only via `summaries.service` methods.
- `model`: present when `status = SUCCEEDED`; null otherwise. Service-level invariant.
- `failureReason`: present when `status = NOT_SUMMARISABLE`; null otherwise. Service-level invariant.

**State transitions**:

```text
(no row)
   │
   ▼
PENDING_RETRY ──(AI service success)──▶ SUCCEEDED   (terminal in v1)
   │
   ├──(AI returns malformed / "abstract too short" / "empty")──▶ NOT_SUMMARISABLE   (terminal)
   │
   └──(transient failure)──▶ PENDING_RETRY  (loop until SUCCEEDED or NOT_SUMMARISABLE)
```

`SUCCEEDED` and `NOT_SUMMARISABLE` are terminal in v1 (no regeneration UX). A future iteration may add a manual operator-driven re-summarisation path.

---

## Existing tables this feature reads (no schema change)

### `Paper` (from `002`) — extended only with a FULLTEXT index

The only schema modification to `Paper` is a new `FULLTEXT` index covering `title` and `abstract`:

```sql
ALTER TABLE Paper ADD FULLTEXT INDEX Paper_title_abstract_fulltext (title, abstract);
```

This is included in the `0003_paper_summaries` migration. Prisma does not natively manage MySQL `FULLTEXT` indexes; the migration applies it via raw SQL. The Prisma schema gains a comment annotation noting the manual index.

`Paper` rows themselves are not touched by this feature.

### `Favorite` (from `001`) — reused as-is

Shape (unchanged):

```prisma
model Favorite {
  id        Int      @id @default(autoincrement())
  userId    Int
  paperId   String   @db.VarChar(64)
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, paperId])
  @@index([userId, createdAt(sort: Desc)])
}
```

This feature interprets `Favorite.paperId` as `Paper.id` (cuid). No foreign-key relationship is added (the existing column already supports the values; adding the FK would be a destructive migration that could fail on `001`'s pre-feature test fixtures, which used arbitrary string `paperId`s — see Decision 10).

Operations:

- Add bookmark: `favorites.service.add(userId, paperId)` — already shipped in `001`. The service is extended (no schema change) to validate that `paperId` is a real `Paper.id` in the user's catalog **at the moment the bookmark is created** (FR-024). After creation, the bookmark persists even if the source topic is deleted (Decision 10).
- Remove bookmark: `favorites.service.remove(userId, paperId)` — already shipped in `001`. Unchanged.
- List favourites with full paper data: NEW in this feature — `favorites.service.listFavoritePapersWithDetails(userId)` joins `Favorite` rows to `Paper` rows (and to `PaperSummary` rows for bullet display, and to the user's current topics for the "fetched by" column). Returns ordered by `Favorite.createdAt DESC`.

### `TopicPaperMatch`, `TrackedTopic`, `User` — read-only here

Used to enforce the catalog-scope privacy invariant (FR-004, FR-009, FR-031). No schema changes.

---

## Enum: `PaperSummaryStatus`

```prisma
enum PaperSummaryStatus {
  PENDING_RETRY
  SUCCEEDED
  NOT_SUMMARISABLE
}
```

Maps to a MySQL `ENUM` column.

---

## Prisma schema sketch

```prisma
// backend/prisma/schema.prisma (additions)

enum PaperSummaryStatus {
  PENDING_RETRY
  SUCCEEDED
  NOT_SUMMARISABLE
}

model PaperSummary {
  id            String              @id @default(cuid())
  paperId       String              @unique
  bullets       Json
  status        PaperSummaryStatus  @default(PENDING_RETRY)
  model         String?             @db.VarChar(64)
  failureReason String?             @db.VarChar(255)
  generatedAt   DateTime?
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt

  paper Paper @relation(fields: [paperId], references: [id], onDelete: Cascade)

  @@index([status])
}
```

`Paper` gains a one-line reverse relation (no field changes):

```prisma
model Paper {
  // ... existing 002 fields ...
  summary PaperSummary?
  // ... existing relations ...
}
```

And, outside Prisma's managed model, the migration appends the `FULLTEXT` index.

---

## Migration: `0003_paper_summaries`

Single additive migration. Key SQL:

- `CREATE TABLE PaperSummary` with the schema above, FK to `Paper(id)` ON DELETE CASCADE.
- `CREATE TYPE PaperSummaryStatus` (in MySQL, an ENUM column).
- All indexes documented above.
- `ALTER TABLE Paper ADD FULLTEXT INDEX Paper_title_abstract_fulltext (title, abstract)` (raw SQL in the migration; Prisma does not manage MySQL `FULLTEXT` natively).

**Rollback**: drop the `Paper_title_abstract_fulltext` index, drop the `PaperSummary` table; no other tables touched.

---

## Cross-references to Spec

| Spec item | Enforced by |
|-----------|-------------|
| FR-008 / FR-009 (search returns only user's catalog) | `paper.repository.searchByUserCatalog(userId, query, filters)` joins through `TopicPaperMatch.userId` |
| FR-010 / FR-011 (automatic summarisation) | `services/fetchCycle.service.ts` post-persistence hook (Decision 4) |
| FR-012 (3–5 bullets) | Zod schema in `services/ai.service.ts`; service-level invariant before insert |
| FR-013 (one summary per paper) | `PaperSummary.@@unique([paperId])` |
| FR-014 (no re-summarisation on subsequent attribution) | Schema unique + service-level "is there already a row?" check |
| FR-015 (transient AI failures retry on next opportunity) | `PaperSummary.status = PENDING_RETRY` + next cycle's `summarizeIfMissing` (Decision 5) |
| FR-016 (no abstract → not_summarisable) | Service-level check before AI call |
| FR-017 (long abstract → truncate or not_summarisable) | Service-level check + Zod-guarded response parsing |
| FR-018 (per-cycle cap) | `AI_PER_CYCLE_SUMMARY_CAP` env var + cycle-level counter (Decision 7) |
| FR-019 (no half-summary displayed) | API contract: only `status = SUCCEEDED` rows expose `bullets` in detail-view responses |
| FR-020–FR-025 (bookmark behaviours) | Reused `Favorite` table (`001`); service-level ownership + "in catalog at time of bookmark" check |
| FR-026 / FR-027 (filter, AND semantics) | `search.service` query builder |
| FR-029 / FR-030 / FR-031 (recommendations scope and no self) | `recommendations.service.findRelated(userId, paperId)` excludes `paperId` and pulls candidates only via `TopicPaperMatch.userId = req.userId` |
| FR-032 (metadata-based similarity) | `recommendations.service` weighted scoring (Decision 11) |
| FR-034 (logging) | Existing application log surface; per-cycle counters recorded in `FetchCycle.stats` (extending the JSON shape already established by `002`) |
