-- AlterTable
ALTER TABLE `User` ADD COLUMN `passwordChangedAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `PasswordResetRequest` (
    `id` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `invalidatedAt` DATETIME(3) NULL,
    `invalidationReason` ENUM('SUPERSEDED', 'PASSWORD_CHANGED', 'USED') NULL,
    `sendAttempts` INTEGER NOT NULL DEFAULT 0,
    `lastSendOutcome` VARCHAR(32) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PasswordResetRequest_tokenHash_key`(`tokenHash`),
    INDEX `PasswordResetRequest_userId_idx`(`userId`),
    INDEX `PasswordResetRequest_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordResetAuditEvent` (
    `id` VARCHAR(191) NOT NULL,
    `userId` INTEGER NULL,
    `eventType` ENUM('REQUESTED', 'SUPPRESSED_NO_ACCOUNT', 'THROTTLED', 'LINK_VERIFIED', 'COMPLETED', 'SEND_FAILED', 'RETRY_EXHAUSTED') NOT NULL,
    `emailAttempted` VARCHAR(254) NULL,
    `ipHash` VARCHAR(64) NULL,
    `detail` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PasswordResetAuditEvent_userId_createdAt_idx`(`userId`, `createdAt` DESC),
    INDEX `PasswordResetAuditEvent_emailAttempted_createdAt_idx`(`emailAttempted`, `createdAt` DESC),
    INDEX `PasswordResetAuditEvent_ipHash_createdAt_idx`(`ipHash`, `createdAt` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PasswordResetRequest` ADD CONSTRAINT `PasswordResetRequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordResetAuditEvent` ADD CONSTRAINT `PasswordResetAuditEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
