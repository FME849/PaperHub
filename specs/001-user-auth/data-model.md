# Phase 1 Data Model: User Authentication and Profile Management

**Feature**: `001-user-auth`
**Date**: 2026-05-16

Two new tables, both owned by the backend Express service and accessed exclusively through Prisma repository modules (constitution principle II, V).

## Entities

### User

Represents a registered person. One-to-one with their profile fields (kept on the same row for simplicity — no separate `Profile` table at this stage).

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `Int` | PK, auto-increment | Internal identifier. |
| `email` | `VARCHAR(254)` | NOT NULL, UNIQUE | Always stored lowercase. Lowercasing happens in the auth service before any DB call. 254 is the RFC 5321 practical max. |
| `passwordHash` | `VARCHAR(60)` | NOT NULL | bcrypt hash (always 60 chars). Never read into the API response. |
| `displayName` | `VARCHAR(80)` | NOT NULL | Free text, 1-80 chars. Defaults to the part of the email before `@` on registration if the client omits it. |
| `bio` | `VARCHAR(500)` | NULL | Optional. |
| `createdAt` | `DATETIME` | NOT NULL, default `CURRENT_TIMESTAMP` | |
| `updatedAt` | `DATETIME` | NOT NULL, auto-updated | Tracked by Prisma. |

**Indexes**:

- `UNIQUE(email)` — supports login lookup and case-insensitive uniqueness (since values are always lowercased).

**Validation rules** (enforced in services / Zod schemas, not just at the DB layer):

- `email` matches a standard email regex; max 254 chars.
- `passwordHash` is set only by the auth service; never accepted from clients.
- `displayName` is required at the API level (auto-derived from email on registration when not supplied); trimmed; rejects strings of only whitespace.
- `bio`, when present, trimmed; max 500 chars.

**State**: Users do not have an explicit lifecycle in this iteration. There is no disabled/locked state, no soft delete. Hard delete is out of scope.

### Favorite

Represents a per-user marker that a paper is a favorite. Forward-compatible with a future `Paper` table — see research Decision 10.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `Int` | PK, auto-increment | |
| `userId` | `Int` | NOT NULL, FK -> `User.id`, ON DELETE CASCADE | Cascade ensures deleting a user removes their favorites. |
| `paperId` | `VARCHAR(64)` | NOT NULL | An arXiv-style identifier (e.g., `2401.12345v2`). No FK in this iteration. |
| `createdAt` | `DATETIME` | NOT NULL, default `CURRENT_TIMESTAMP` | Used for default ordering ("most recently favorited first"). |

**Indexes**:

- `UNIQUE(userId, paperId)` — enforces idempotency (spec FR-018).
- `INDEX(userId, createdAt DESC)` — supports the favorites-list ordering without a sort cost.

**Validation rules**:

- `paperId` matches a permissive arXiv ID regex (`^[A-Za-z0-9.\-/]{3,64}$`); trimmed.
- `userId` is taken from the authenticated session, never from the request body.

**State**: A Favorite either exists or it does not. Re-favoriting a paper while a row already exists is a no-op (the service detects the unique-constraint conflict and returns success).

## Prisma schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model User {
  id           Int        @id @default(autoincrement())
  email        String     @unique @db.VarChar(254)
  passwordHash String     @db.VarChar(60)
  displayName  String     @db.VarChar(80)
  bio          String?    @db.VarChar(500)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  favorites    Favorite[]
}

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

## Relationships

```text
User 1 ─── * Favorite
       │
       └── cascade on delete
```

There are no other relationships in this feature. The `Favorite.paperId` is intentionally a denormalized string rather than a foreign key (see research Decision 10).

## Notes for downstream phases

- The API contracts in `contracts/` reference these entity field names directly.
- When MVP feature #4 (paper storage) lands, add a `Paper` table and migrate `Favorite.paperId` to a FK in a single non-destructive migration: introduce `paperId` as an FK pointer, backfill from the existing string column (if values match canonical IDs), then drop the string column.
- No seed data is required; the first user is created by the regular registration flow.
