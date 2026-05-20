import type { TrackedTopic } from "@prisma/client";

import { env } from "../config/env.js";
import { fetchCycleRepository } from "../repositories/fetchCycle.repository.js";
import { topicPaperMatchRepository } from "../repositories/topicPaperMatch.repository.js";
import { trackedTopicRepository } from "../repositories/trackedTopic.repository.js";

import { arxivService } from "./arxiv.service.js";
import { papersService } from "./papers.service.js";

interface SourceStats {
  ok: number;
  fail: number;
}

interface CycleStats {
  sources: Record<string, SourceStats>;
  topics: {
    total: number;
    succeeded: number;
    failed: number;
    newMatches: number;
    capped: number;
  };
  errors: Array<{ topicId: string; reason: string }>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function runTopic(
  topic: TrackedTopic,
  cycleStartedAt: Date,
  cycleId: string,
  stats: CycleStats,
): Promise<void> {
  const keywords = asStringArray(topic.keywords);
  const sourceFilters = asStringArray(topic.sourceFilters);
  if (keywords.length === 0 || sourceFilters.length === 0) {
    stats.topics.failed++;
    stats.errors.push({ topicId: topic.id, reason: "topic has empty keywords or sourceFilters" });
    return;
  }

  const initialWindowMs = env.INITIAL_FETCH_WINDOW_HOURS * 60 * 60 * 1000;
  const windowStart = topic.lastFetchedAt
    ? topic.lastFetchedAt
    : new Date(cycleStartedAt.getTime() - initialWindowMs);
  const windowEnd = cycleStartedAt;

  console.log(
    `[fetch-cycle] topic=${topic.id} window=${windowStart.toISOString()}..${windowEnd.toISOString()} keywords=${keywords.length} filters=${sourceFilters.length}`,
  );

  let papers;
  try {
    papers = await arxivService.searchTopic({
      keywords,
      sourceFilters,
      windowStart,
      windowEnd,
    });
  } catch (err) {
    stats.sources.arxiv = stats.sources.arxiv ?? { ok: 0, fail: 0 };
    stats.sources.arxiv.fail++;
    stats.topics.failed++;
    stats.errors.push({ topicId: topic.id, reason: describeError(err) });
    console.warn(`[fetch-cycle] topic=${topic.id} arxiv failure: ${describeError(err)}`);
    return;
  }

  stats.sources.arxiv = stats.sources.arxiv ?? { ok: 0, fail: 0 };
  stats.sources.arxiv.ok++;

  const cap = env.MAX_NEW_PAPERS_PER_TOPIC_PER_CYCLE;
  let newAttributions = 0;
  let capped = false;

  for (const paper of papers) {
    if (newAttributions >= cap) {
      capped = true;
      break;
    }

    const stillExists = await trackedTopicRepository.findById(topic.id);
    if (!stillExists) {
      console.log(`[fetch-cycle] topic=${topic.id} disappeared mid-fetch; skipping`);
      stats.topics.failed++;
      return;
    }

    try {
      const paperId = await papersService.upsertFromArxiv({
        primarySource: "arxiv",
        sourcePaperId: paper.sourcePaperId,
        title: paper.title,
        abstract: paper.abstract,
        authors: paper.authors,
        sourceUrl: paper.sourceUrl,
        publishedAt: paper.publishedAt,
      });
      const { created } = await topicPaperMatchRepository.attribute({
        trackedTopicId: topic.id,
        paperId,
        cycleId,
      });
      if (created) newAttributions++;
    } catch (err) {
      console.warn(
        `[fetch-cycle] topic=${topic.id} paper=${paper.sourcePaperId} attribute error: ${describeError(err)}`,
      );
    }
  }

  await trackedTopicRepository.setLastFetchedAt(topic.id, windowEnd);
  stats.topics.succeeded++;
  stats.topics.newMatches += newAttributions;
  if (capped) stats.topics.capped++;

  console.log(
    `[fetch-cycle] topic=${topic.id} fetched=${papers.length} newAttributions=${newAttributions}${
      capped ? ` (capped at ${cap})` : ""
    }`,
  );
}

export const fetchCycleService = {
  async run(): Promise<{ cycleId: string; stats: CycleStats }> {
    const cycle = await fetchCycleRepository.startCycle();
    console.log(`[fetch-cycle] start cycle=${cycle.id} (RUNNING)`);

    const stats: CycleStats = {
      sources: {},
      topics: { total: 0, succeeded: 0, failed: 0, newMatches: 0, capped: 0 },
      errors: [],
    };

    let topics: TrackedTopic[];
    try {
      topics = await trackedTopicRepository.listAllActive();
    } catch (err) {
      const reason = describeError(err);
      console.error(`[fetch-cycle] cycle=${cycle.id} failed to list topics: ${reason}`);
      await fetchCycleRepository.finalizeCycle(cycle.id, "FAILED", {
        ...stats,
        reason,
      });
      throw err;
    }

    stats.topics.total = topics.length;

    for (const topic of topics) {
      await runTopic(topic, cycle.startedAt, cycle.id, stats);
    }

    const status =
      stats.topics.failed === 0
        ? "SUCCEEDED"
        : stats.topics.succeeded === 0
          ? "FAILED"
          : "PARTIAL";
    await fetchCycleRepository.finalizeCycle(cycle.id, status, stats);

    console.log(
      `[fetch-cycle] cycle=${cycle.id} ${status} stats=${JSON.stringify({
        sources: stats.sources,
        topics: stats.topics,
      })}`,
    );

    return { cycleId: cycle.id, stats };
  },
};
