import { geminiClient } from "../external/gemini.client.js";

const MIN_ABSTRACT_LENGTH = 80;
const MAX_ABSTRACT_LENGTH = 16000;

export type SummarizeOutcome =
  | { kind: "succeeded"; bullets: string[]; model: string }
  | { kind: "not_summarisable"; reason: string };

/**
 * Provider-agnostic AI service. v1 is backed by Gemini (research.md Decision 1).
 * Swapping the provider stays inside external/ + this file — controllers /
 * repositories / other services are unaffected.
 */
export const aiService = {
  /**
   * Summarise an abstract into 3–5 short bullets.
   * Returns a tagged union so the caller can distinguish "we can't summarise this"
   * from "the AI failed transiently" (which is signalled by a thrown AiClientError).
   */
  async summarizeAbstract(abstract: string): Promise<SummarizeOutcome> {
    const trimmed = abstract.trim();
    if (trimmed.length < MIN_ABSTRACT_LENGTH) {
      return { kind: "not_summarisable", reason: "abstract_too_short_or_empty" };
    }

    const text = trimmed.length > MAX_ABSTRACT_LENGTH ? trimmed.slice(0, MAX_ABSTRACT_LENGTH) : trimmed;

    const result = await geminiClient.summarize(text);
    return { kind: "succeeded", bullets: result.bullets, model: result.model };
  },
};
