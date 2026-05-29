import { AiClientError, AiResponseShapeError } from "../errors.js";
import { paperRepository } from "../repositories/paper.repository.js";
import { paperSummaryRepository } from "../repositories/paperSummary.repository.js";

import { aiService } from "./ai.service.js";

export type SummarizeIfMissingOutcome =
  | { kind: "already_succeeded" }
  | { kind: "succeeded" }
  | { kind: "skipped_no_paper" }
  | { kind: "not_summarisable"; reason: string }
  | { kind: "failed_transient"; reason: string };

export const summariesService = {
  /**
   * Ensure a paper has a SUCCEEDED summary. Idempotent — short-circuits
   * if one already exists. Caller is the fetch cycle (FR-010 / FR-011)
   * or the operator backfill script (research.md Decision 13).
   *
   * Never throws. Transient AI failures leave the row at PENDING_RETRY and
   * surface via the returned outcome so the caller can count for diagnostics.
   */
  async summarizeIfMissing(paperId: string): Promise<SummarizeIfMissingOutcome> {
    const existing = await paperSummaryRepository.findByPaperId(paperId);
    if (existing && existing.status === "SUCCEEDED" && existing.model !== "gemini-2.0-flash-mocked") {
      return { kind: "already_succeeded" };
    }
    if (existing && existing.status === "NOT_SUMMARISABLE") {
      return { kind: "not_summarisable", reason: existing.failureReason ?? "previously_not_summarisable" };
    }

    const paper = await paperRepository.findById(paperId);
    if (!paper) return { kind: "skipped_no_paper" };

    // Claim the slot (idempotent — concurrent claims race at the unique index
    // and one wins; the loser sees the same PENDING_RETRY row).
    await paperSummaryRepository.upsertPending(paperId);

    let outcome;
    try {
      outcome = await aiService.summarizeAbstract(paper.abstract);
    } catch (err) {
      if (err instanceof AiClientError) {
        return { kind: "failed_transient", reason: err.message };
      }
      if (err instanceof AiResponseShapeError) {
        await paperSummaryRepository.setNotSummarisable(paperId, "malformed_ai_response");
        return { kind: "not_summarisable", reason: "malformed_ai_response" };
      }
      const message = err instanceof Error ? err.message : String(err);
      return { kind: "failed_transient", reason: message };
    }

    if (outcome.kind === "not_summarisable") {
      await paperSummaryRepository.setNotSummarisable(paperId, outcome.reason);
      return { kind: "not_summarisable", reason: outcome.reason };
    }

    await paperSummaryRepository.setSucceeded(paperId, {
      bullets: outcome.bullets,
      model: outcome.model,
    });
    return { kind: "succeeded" };
  },
};
