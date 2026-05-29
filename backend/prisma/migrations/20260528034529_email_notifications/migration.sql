-- DropIndex
DROP INDEX `Paper_title_abstract_fulltext` ON `Paper`;

-- CreateTable
CREATE TABLE `EmailNotificationPreference` (
    `id` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `lastChangedVia` ENUM('SETTINGS_UI', 'UNSUBSCRIBE_LINK', 'SYSTEM') NOT NULL DEFAULT 'SETTINGS_UI',
    `lastChangedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `EmailNotificationPreference_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DigestSendRecord` (
    `id` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,
    `fetchCycleId` VARCHAR(191) NOT NULL,
    `outcome` ENUM('STARTED', 'SENT', 'SUPPRESSED_PREFERENCE_OFF', 'SUPPRESSED_EMPTY', 'SUPPRESSED_BOUNCE_QUARANTINE', 'FAILED_RETRYABLE', 'FAILED_PERMANENT') NOT NULL,
    `candidatePaperCount` INTEGER NOT NULL DEFAULT 0,
    `includedPaperIds` JSON NOT NULL,
    `recipientEmail` VARCHAR(254) NULL,
    `attemptedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,
    `failureReason` VARCHAR(255) NULL,

    INDEX `DigestSendRecord_fetchCycleId_outcome_idx`(`fetchCycleId`, `outcome`),
    INDEX `DigestSendRecord_userId_attemptedAt_idx`(`userId`, `attemptedAt` DESC),
    UNIQUE INDEX `DigestSendRecord_userId_fetchCycleId_key`(`userId`, `fetchCycleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmailDeliveryFailure` (
    `id` VARCHAR(191) NOT NULL,
    `recipientEmail` VARCHAR(254) NOT NULL,
    `userId` INTEGER NULL,
    `failureClass` ENUM('HARD_BOUNCE', 'SOFT_BOUNCE', 'CONNECTION_ERROR', 'TIMEOUT', 'OTHER') NOT NULL,
    `smtpResponseCode` INTEGER NULL,
    `message` VARCHAR(500) NULL,
    `digestSendRecordId` VARCHAR(191) NULL,
    `reportedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EmailDeliveryFailure_recipientEmail_reportedAt_idx`(`recipientEmail`, `reportedAt` DESC),
    INDEX `EmailDeliveryFailure_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EmailNotificationPreference` ADD CONSTRAINT `EmailNotificationPreference_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DigestSendRecord` ADD CONSTRAINT `DigestSendRecord_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DigestSendRecord` ADD CONSTRAINT `DigestSendRecord_fetchCycleId_fkey` FOREIGN KEY (`fetchCycleId`) REFERENCES `FetchCycle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmailDeliveryFailure` ADD CONSTRAINT `EmailDeliveryFailure_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmailDeliveryFailure` ADD CONSTRAINT `EmailDeliveryFailure_digestSendRecordId_fkey` FOREIGN KEY (`digestSendRecordId`) REFERENCES `DigestSendRecord`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
