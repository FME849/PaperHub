-- CreateTable
CREATE TABLE `PaperSummary` (
    `id` VARCHAR(191) NOT NULL,
    `paperId` VARCHAR(191) NOT NULL,
    `bullets` JSON NOT NULL,
    `status` ENUM('PENDING_RETRY', 'SUCCEEDED', 'NOT_SUMMARISABLE') NOT NULL DEFAULT 'PENDING_RETRY',
    `model` VARCHAR(64) NULL,
    `failureReason` VARCHAR(255) NULL,
    `generatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PaperSummary_paperId_key`(`paperId`),
    INDEX `PaperSummary_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PaperSummary` ADD CONSTRAINT `PaperSummary_paperId_fkey` FOREIGN KEY (`paperId`) REFERENCES `Paper`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- FULLTEXT index on Paper(title, abstract) for relevance-ranked search.
-- Added via raw SQL because Prisma does not manage MySQL FULLTEXT indexes natively
-- (see specs/003-paper-summary-search/research.md Decision 8).
ALTER TABLE `Paper` ADD FULLTEXT INDEX `Paper_title_abstract_fulltext` (`title`, `abstract`);
