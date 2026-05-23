import {
  GoogleGenerativeAI,
  SchemaType,
  type GenerativeModel,
  type Schema,
} from "@google/generative-ai";
import { z } from "zod";

import { env } from "../config/env.js";
import {
  BULLET_SUMMARY_SYSTEM_PROMPT,
  renderBulletSummaryUserPrompt,
} from "../config/prompts.js";
import { AiClientError, AiResponseShapeError } from "../errors.js";

const bulletSummarySchema = z.object({
  bullets: z.array(z.string().trim().min(1)).min(3).max(5),
});

let cachedClient: GoogleGenerativeAI | null = null;
let cachedModel: GenerativeModel | null = null;
let cachedModelName: string | null = null;

function getModel(): GenerativeModel {
  if (!env.GEMINI_API_KEY) {
    throw new AiClientError("GEMINI_API_KEY is not configured.");
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  }
  if (!cachedModel || cachedModelName !== env.GEMINI_MODEL) {
    cachedModel = cachedClient.getGenerativeModel({
      model: env.GEMINI_MODEL,
      systemInstruction: BULLET_SUMMARY_SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            bullets: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
              minItems: 3,
              maxItems: 5,
            },
          },
          required: ["bullets"],
        } satisfies Schema,
      },
    });
    cachedModelName = env.GEMINI_MODEL;
  }
  return cachedModel;
}

export interface GeminiBulletSummary {
  bullets: string[];
  model: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new AiClientError(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function isLikelyTransientMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("rate") ||
    m.includes("429") ||
    m.includes("resource") ||
    m.includes("timeout") ||
    m.includes("unavailable") ||
    m.includes("503") ||
    m.includes("502") ||
    m.includes("500") ||
    m.includes("fetch failed") ||
    m.includes("network")
  );
}

export const geminiClient = {
  /**
   * Summarise one abstract into 3–5 short bullets.
   *
   * Throws AiClientError for transport / rate-limit / timeout failures
   * (treated as transient by the caller — left as PENDING_RETRY).
   * Throws AiResponseShapeError for malformed model output.
   */
  async summarize(abstract: string): Promise<GeminiBulletSummary> {
    const model = getModel();
    const prompt = renderBulletSummaryUserPrompt(abstract);

    let text: string;
    try {
      const result = await withTimeout(
        model.generateContent(prompt),
        env.AI_TIMEOUT_MS,
        "gemini.generateContent",
      );
      text = result.response.text();
    } catch (err) {
      if (err instanceof AiClientError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      if (isLikelyTransientMessage(message)) {
        throw new AiClientError(`gemini transient failure: ${message}`);
      }
      throw new AiClientError(`gemini call failed: ${message}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new AiResponseShapeError({ reason: "json_parse_failed", text, cause: String(err) });
    }

    const validated = bulletSummarySchema.safeParse(parsed);
    if (!validated.success) {
      throw new AiResponseShapeError({
        reason: "schema_validation_failed",
        issues: validated.error.flatten(),
        text,
      });
    }

    return {
      bullets: validated.data.bullets,
      model: env.GEMINI_MODEL,
    };
  },
};
