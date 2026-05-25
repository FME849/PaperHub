-- DropIndex
DROP INDEX `Favorite_userId_createdAt_idx` ON `favorite`;

-- DropIndex
DROP INDEX `FetchCycle_startedAt_idx` ON `fetchcycle`;

-- DropIndex
DROP INDEX `TopicPaperMatch_trackedTopicId_fetchedAt_idx` ON `topicpapermatch`;

-- CreateIndex
CREATE INDEX `Favorite_userId_createdAt_idx` ON `Favorite`(`userId`, `createdAt` DESC);

-- CreateIndex
CREATE INDEX `FetchCycle_startedAt_idx` ON `FetchCycle`(`startedAt` DESC);

-- CreateIndex
CREATE INDEX `TopicPaperMatch_trackedTopicId_fetchedAt_idx` ON `TopicPaperMatch`(`trackedTopicId`, `fetchedAt` DESC);
