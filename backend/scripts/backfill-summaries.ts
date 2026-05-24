import { env } from "../src/config/env.js";
import { prisma } from "../src/db.js";
import { paperSummaryRepository } from "../src/repositories/paperSummary.repository.js";
import { summariesService } from "../src/services/summaries.service.js";

// research.md Decision 13 — operator-run only, respects per-cycle cap and pacing.
const AI_INTER_CALL_MS = 4000;

interface BackfillStats {
  attempted: number;
  succeeded: number;
  alreadySucceeded: number;
  notSummarisable: number;
  failedTransient: number;
}

async function main(): Promise<void> {
  const cap = env.AI_PER_CYCLE_SUMMARY_CAP;
  const paperIds = await paperSummaryRepository.listPapersNeedingSummary(cap);

  console.log(`[backfill] found ${paperIds.length} paper(s) needing summary (cap=${cap})`);
  if (paperIds.length === 0) {
    console.log("[backfill] nothing to do — exiting");
    return;
  }

  const stats: BackfillStats = {
    attempted: 0,
    succeeded: 0,
    alreadySucceeded: 0,
    notSummarisable: 0,
    failedTransient: 0,
  };

  let lastCallAt = 0;
  for (const paperId of paperIds) {
    const elapsed = Date.now() - lastCallAt;
    const wait = AI_INTER_CALL_MS - elapsed;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCallAt = Date.now();

    stats.attempted++;
    const outcome = await summariesService.summarizeIfMissing(paperId);
    switch (outcome.kind) {
      case "succeeded":
        stats.succeeded++;
        console.log(`[backfill] paper=${paperId} SUCCEEDED`);
        break;
      case "already_succeeded":
        stats.alreadySucceeded++;
        break;
      case "not_summarisable":
        stats.notSummarisable++;
        console.log(`[backfill] paper=${paperId} NOT_SUMMARISABLE reason=${outcome.reason}`);
        break;
      case "failed_transient":
        stats.failedTransient++;
        console.warn(`[backfill] paper=${paperId} transient failure: ${outcome.reason}`);
        break;
      case "skipped_no_paper":
        break;
    }
  }

  console.log(`[backfill] done ${JSON.stringify(stats)}`);
  if (stats.failedTransient > 0) {
    console.log("[backfill] some calls failed transiently — re-run the script to retry");
  }
}

main()
  .catch((err: unknown) => {
    console.error("[backfill] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
