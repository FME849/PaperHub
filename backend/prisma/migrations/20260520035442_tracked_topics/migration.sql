-- CreateTable
CREATE TABLE `TrackedTopic` (
    `id` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `nameLower` VARCHAR(120) NOT NULL,
    `keywords` JSON NOT NULL,
    `sourceFilters` JSON NOT NULL,
    `lastFetchedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TrackedTopic_userId_idx`(`userId`),
    INDEX `TrackedTopic_lastFetchedAt_idx`(`lastFetchedAt`),
    UNIQUE INDEX `TrackedTopic_userId_nameLower_key`(`userId`, `nameLower`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Paper` (
    `id` VARCHAR(191) NOT NULL,
    `primarySource` VARCHAR(32) NOT NULL,
    `sourcePaperId` VARCHAR(64) NOT NULL,
    `title` TEXT NOT NULL,
    `abstract` TEXT NOT NULL,
    `authors` JSON NOT NULL,
    `sourceUrl` VARCHAR(512) NOT NULL,
    `publishedAt` DATETIME(3) NOT NULL,
    `firstFetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Paper_publishedAt_idx`(`publishedAt`),
    UNIQUE INDEX `Paper_primarySource_sourcePaperId_key`(`primarySource`, `sourcePaperId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TopicPaperMatch` (
    `id` VARCHAR(191) NOT NULL,
    `trackedTopicId` VARCHAR(191) NOT NULL,
    `paperId` VARCHAR(191) NOT NULL,
    `fetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `cycleId` VARCHAR(191) NULL,

    INDEX `TopicPaperMatch_trackedTopicId_fetchedAt_idx`(`trackedTopicId`, `fetchedAt` DESC),
    INDEX `TopicPaperMatch_paperId_idx`(`paperId`),
    UNIQUE INDEX `TopicPaperMatch_trackedTopicId_paperId_key`(`trackedTopicId`, `paperId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FetchCycle` (
    `id` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `status` ENUM('RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL') NOT NULL DEFAULT 'RUNNING',
    `stats` JSON NOT NULL,

    INDEX `FetchCycle_startedAt_idx`(`startedAt` DESC),
    INDEX `FetchCycle_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TrackedTopic` ADD CONSTRAINT `TrackedTopic_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TopicPaperMatch` ADD CONSTRAINT `TopicPaperMatch_trackedTopicId_fkey` FOREIGN KEY (`trackedTopicId`) REFERENCES `TrackedTopic`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TopicPaperMatch` ADD CONSTRAINT `TopicPaperMatch_paperId_fkey` FOREIGN KEY (`paperId`) REFERENCES `Paper`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TopicPaperMatch` ADD CONSTRAINT `TopicPaperMatch_cycleId_fkey` FOREIGN KEY (`cycleId`) REFERENCES `FetchCycle`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
