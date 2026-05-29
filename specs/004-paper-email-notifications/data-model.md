# Phase 1 Data Model: Email Notifications for Newly Fetched Papers

This document captures the database changes introduced by this feature and the read model the notification orchestrator operates on.

All new tables are additive. **No** existing column is modified, renamed, or dropped. The migration is named `0004_email_notifications`.

---

## Entities

### 1. `EmailNotificationPreference`

Per-user opt-in setting for digest emails. Exactly one row per user; default created lazily on first read / first write.

| Field            | Type                                 | Notes |
|------------------|--------------------------------------|-------|
| `id`             | `String @id @default(cuid())`        | |
| `userId`         | `Int @unique`                        | FK → `User.id`, cascade on user delete (1-to-1) |
| `enabled`        | `Boolean @default(false)`            | Default **off** per FR-009 |
| `lastChangedAt`  | `DateTime @default(now()) @updatedAt`| |
| `lastChangedVia` | `PreferenceChangeSource @default(SETTINGS_UI)` | enum below |
| `createdAt`      | `DateTime @default(now())`           | |

```prisma
enum PreferenceChangeSource {
  SETTINGS_UI
  UNSUBSCRIBE_LINK
  SYSTEM            // reserved for ops-driven changes (e.g., GDPR erasure); unused in v1
}
```

**Indexes**: `@@unique([userId])` implicit from the `@unique` on `userId`.

**Lifecycle**:

- Row is created on first `PUT /api/notifications/preference` or first unsubscribe-link click for a user who has no row yet (the API does an upsert).
- Default `enabled = false` ensures FR-009 ("defaults to off for both new and existing accounts") holds even for users who never visit settings.
- A read for a user without a row returns the default `enabled = false` shape without writing.

---

### 2. `DigestSendRecord`

One row per `(user, fetchCycle)` pair, recording the digest send attempt and outcome. Used to enforce FR-006 (no duplicate notifications) and FR-007 (one per cycle), and to drive FR-016 operational audit.

| Field                | Type                                | Notes |
|----------------------|-------------------------------------|-------|
| `id`                 | `String @id @default(cuid())`       | |
| `userId`             | `Int`                               | FK → `User.id`, cascade on user delete |
| `fetchCycleId`       | `String`                            | FK → `FetchCycle.id`, restrict on cycle delete (we don't expect cycles to be deleted) |
| `outcome`            | `DigestSendOutcome`                 | enum below; `STARTED` while the job is mid-send, terminal states on completion |
| `candidatePaperCount`| `Int @default(0)`                   | Total newly attributed papers to this user in this cycle. Drives "See more" link visibility (`> DIGEST_TOP_PICKS_COUNT`). |
| `includedPaperIds`   | `Json @default("[]")`               | The (up to 3) `Paper.id` cuids picked for this digest. `Json` because Prisma + MySQL doesn't have a typed `String[]`; Zod-narrowed on read. |
| `recipientEmail`     | `String? @db.VarChar(254)`          | Email address used at send time; null if suppressed before send. Allows post-hoc audit even if the user later changes their email. |
| `attemptedAt`        | `DateTime @default(now())`          | |
| `completedAt`        | `DateTime?`                         | Set when `outcome` transitions out of `STARTED`. |
| `failureReason`      | `String? @db.VarChar(255)`          | Short description for `FAILED_RETRYABLE` / `FAILED_PERMANENT` rows. |

```prisma
enum DigestSendOutcome {
  STARTED                       // lock row inserted; send in progress
  SENT                          // delivered to SMTP successfully
  SUPPRESSED_PREFERENCE_OFF     // user's preference was off at compose time
  SUPPRESSED_EMPTY              // candidate set empty; no email composed
  SUPPRESSED_BOUNCE_QUARANTINE  // recipient address is in bounce quarantine
  FAILED_RETRYABLE              // transient SMTP failure; not retried inside this cycle's job
  FAILED_PERMANENT              // SMTP rejected synchronously (550 / 553 / etc.); also writes EmailDeliveryFailure
}
```

**Indexes**:

- `@@unique([userId, fetchCycleId])` — schema-level idempotency anchor (FR-006, FR-007).
- `@@index([fetchCycleId, outcome])` — operational queries (e.g., "how many users got a digest for cycle X").
- `@@index([userId, attemptedAt(sort: Desc)])` — per-user audit / future "show me your last digest" surfaces.

**Lifecycle**:

- Notification job, per eligible user, **inserts** a row with `outcome = STARTED` inside a transaction with `@@unique([userId, fetchCycleId])` enforcement. If the insert conflicts (`P2002` on the unique), the user already has a record for this cycle and the job **skips them** (this is the idempotency check; satisfies FR-006/FR-011/FR-015).
- After the send attempt, the row is updated to a terminal `outcome` and `completedAt` is set.
- If the process crashes between `STARTED` and the terminal update, a subsequent re-run sees a `STARTED` row and **also skips** (with a warning log) — this is intentional: we accept a small risk of "one missed digest after a crash" in v1 rather than risk a duplicate send. Documented in [research.md](./research.md) Decision 2.

---

### 3. `EmailDeliveryFailure`

One row per synchronous SMTP failure reported by the mail provider. Aggregated by the notification job to enforce FR-016's consecutive-bounce suppression.

| Field            | Type                                 | Notes |
|------------------|--------------------------------------|-------|
| `id`             | `String @id @default(cuid())`        | |
| `recipientEmail` | `String @db.VarChar(254)`            | The address that the failure was reported against. Lowercased on write. |
| `userId`         | `Int?`                               | FK → `User.id`, set-null on user delete. Null if the address no longer maps to any user (rare; preserves bounce history). |
| `failureClass`   | `EmailFailureClass`                  | enum below |
| `smtpResponseCode` | `Int?`                             | e.g., 550, 553. Null for non-SMTP-numeric errors (timeout, connection refused). |
| `message`        | `String? @db.VarChar(500)`           | Short error text; truncated; no provider-specific PII. |
| `digestSendRecordId` | `String?`                        | FK → `DigestSendRecord.id`, set-null on record delete. Links the failure to the specific send attempt that produced it. |
| `reportedAt`     | `DateTime @default(now())`           | |

```prisma
enum EmailFailureClass {
  HARD_BOUNCE        // permanent: 550 / 553 / similar
  SOFT_BOUNCE        // transient: 421 / 450 / 451 / similar
  CONNECTION_ERROR   // could not reach the SMTP server at all
  TIMEOUT            // SMTP server accepted connection but did not respond in time
  OTHER              // anything else; logged for visibility, not used in suppression
}
```

**Indexes**:

- `@@index([recipientEmail, reportedAt(sort: Desc)])` — drives the "last N consecutive hard bounces for this address?" query for FR-016.
- `@@index([userId])` — per-account audit.

**Lifecycle**:

- Created by `notifications.service.ts` immediately when an SMTP send returns a numeric failure code, before transitioning the corresponding `DigestSendRecord` to its terminal `FAILED_*` state.
- Read by the notification job's pre-send check: if the recipient address has ≥ `HARD_BOUNCE_THRESHOLD` (default 3) consecutive `HARD_BOUNCE` rows since the last `SENT` `DigestSendRecord` for that user, the new attempt is recorded as `SUPPRESSED_BOUNCE_QUARANTINE` and the SMTP call is skipped.

---

## Read model (no new table)

### Per-user, per-cycle "new attribution set"

The set of paper-topic attributions newly created for one user in one fetch cycle is read directly from existing tables. No new entity is needed because `TopicPaperMatch` already carries the `cycleId` column added in `0002`:

```sql
SELECT m.paperId, m.trackedTopicId, m.fetchedAt, p.publishedAt
FROM   TopicPaperMatch m
JOIN   TrackedTopic    t ON t.id = m.trackedTopicId AND t.userId = :userId
JOIN   Paper           p ON p.id = m.paperId
WHERE  m.cycleId = :cycleId
ORDER  BY p.publishedAt DESC, m.fetchedAt DESC, p.id ASC;
```

This becomes `topicPaperMatch.repository.listNewAttributionsForUserInCycle(userId, cycleId)` in TypeScript. The notification service then:

1. Counts the rows → `candidatePaperCount` (drives the "See more" link).
2. Takes the top 3 by the SQL ordering above → `includedPaperIds` (Decision 4 in research.md).
3. Looks up `PaperSummary` for each of the top 3; missing or non-SUCCEEDED rows yield a placeholder string at render time.

Topic deletions are handled automatically by the `JOIN TrackedTopic … userId = :userId` — a topic the user has deleted no longer appears in the join, so its papers are excluded (FR's edge case "user deletes a tracked topic between attribution and digest send").

---

## Migration `0004_email_notifications` — SQL summary

The migration is additive only. Generated by `prisma migrate dev` after the schema is updated; the SQL file will create three tables and three enums:

```sql
-- New enums
CREATE TABLE _prisma_dummy_unused_for_enum_signatures (id INT);
DROP TABLE _prisma_dummy_unused_for_enum_signatures;
-- Prisma generates the enum constraints inline on the tables that use them
-- (MySQL doesn't have CREATE TYPE; enums are declared in the column definitions).

-- EmailNotificationPreference
CREATE TABLE `EmailNotificationPreference` (
  `id`             VARCHAR(191) NOT NULL,
  `userId`         INT          NOT NULL,
  `enabled`        BOOLEAN      NOT NULL DEFAULT false,
  `lastChangedAt`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `lastChangedVia` ENUM('SETTINGS_UI','UNSUBSCRIBE_LINK','SYSTEM') NOT NULL DEFAULT 'SETTINGS_UI',
  `createdAt`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `EmailNotificationPreference_userId_key` (`userId`),
  CONSTRAINT `EmailNotificationPreference_userId_fkey` FOREIGN KEY (`userId`)
    REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB;

-- DigestSendRecord
CREATE TABLE `DigestSendRecord` (
  `id`                   VARCHAR(191) NOT NULL,
  `userId`               INT          NOT NULL,
  `fetchCycleId`         VARCHAR(191) NOT NULL,
  `outcome`              ENUM('STARTED','SENT','SUPPRESSED_PREFERENCE_OFF','SUPPRESSED_EMPTY',
                              'SUPPRESSED_BOUNCE_QUARANTINE','FAILED_RETRYABLE','FAILED_PERMANENT')
                         NOT NULL,
  `candidatePaperCount`  INT          NOT NULL DEFAULT 0,
  `includedPaperIds`     JSON         NOT NULL,
  `recipientEmail`       VARCHAR(254) NULL,
  `attemptedAt`          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt`          DATETIME(3)  NULL,
  `failureReason`        VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `DigestSendRecord_userId_fetchCycleId_key` (`userId`, `fetchCycleId`),
  INDEX `DigestSendRecord_fetchCycleId_outcome_idx` (`fetchCycleId`, `outcome`),
  INDEX `DigestSendRecord_userId_attemptedAt_idx` (`userId`, `attemptedAt` DESC),
  CONSTRAINT `DigestSendRecord_userId_fkey` FOREIGN KEY (`userId`)
    REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `DigestSendRecord_fetchCycleId_fkey` FOREIGN KEY (`fetchCycleId`)
    REFERENCES `FetchCycle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB;

-- EmailDeliveryFailure
CREATE TABLE `EmailDeliveryFailure` (
  `id`                  VARCHAR(191) NOT NULL,
  `recipientEmail`      VARCHAR(254) NOT NULL,
  `userId`              INT          NULL,
  `failureClass`        ENUM('HARD_BOUNCE','SOFT_BOUNCE','CONNECTION_ERROR','TIMEOUT','OTHER') NOT NULL,
  `smtpResponseCode`    INT          NULL,
  `message`             VARCHAR(500) NULL,
  `digestSendRecordId`  VARCHAR(191) NULL,
  `reportedAt`          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `EmailDeliveryFailure_recipientEmail_reportedAt_idx` (`recipientEmail`, `reportedAt` DESC),
  INDEX `EmailDeliveryFailure_userId_idx` (`userId`),
  CONSTRAINT `EmailDeliveryFailure_userId_fkey` FOREIGN KEY (`userId`)
    REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `EmailDeliveryFailure_digestSendRecordId_fkey` FOREIGN KEY (`digestSendRecordId`)
    REFERENCES `DigestSendRecord`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB;
```

The exact SQL is generated by `prisma migrate dev` from the updated `schema.prisma`; the above is reference-only.

---

## Relationship diagram (informal)

```text
User ─┬───<owns 1>── EmailNotificationPreference
      ├───<has 0..*>─ DigestSendRecord ──<for 1>── FetchCycle
      ├───<has 0..*>─ EmailDeliveryFailure
      ├───<has 0..*>─ TrackedTopic
      │                    └──<has 0..*>── TopicPaperMatch ──<for 1>── Paper
      │                                                            └── PaperSummary (0..1; from 003)
      └───(existing)
```

No changes to entities owned by `001`, `002`, or `003`. The notification feature consumes them.

---

## Constraint summary (spec → schema)

| Spec invariant | Enforced by |
|---|---|
| FR-006: each paper-topic attribution appears in at most one digest per user | `DigestSendRecord.@@unique([userId, fetchCycleId])` × deterministic `includedPaperIds` selection (Decision 4) |
| FR-007: at most one digest per user per cycle | Same `@@unique([userId, fetchCycleId])`; pre-insert upsert acts as the lock |
| FR-008: per-user isolation | `JOIN TrackedTopic … userId = :userId` in `listNewAttributionsForUserInCycle` |
| FR-009: preference defaults to off | `EmailNotificationPreference.enabled @default(false)` |
| FR-010: preference changes take effect next cycle, never retroactive | Notification job reads the current preference at compose time, in-cycle only |
| FR-013: async (no HTTP path) | Notification job lives in `fetchCycle.service.run()`'s tail; no controller invokes it |
| FR-014: failed sends log + don't crash | Per-recipient `try/catch` + `EmailDeliveryFailure` insert + `DigestSendRecord.outcome = FAILED_*` |
| FR-016: bounce quarantine | `EmailDeliveryFailure` aggregation + `outcome = SUPPRESSED_BOUNCE_QUARANTINE` |
| FR-017: no session credentials in deep links | Deep links use only `paperId` / `cycleId` / `token` (HMAC) — never JWTs or session IDs |
