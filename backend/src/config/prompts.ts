/**
 * In-code prompt templates for the AI service.
 *
 * Kept as static strings so a single source-controlled location owns
 * the prompt; the AI provider client renders these into provider-specific
 * request shapes (research.md Decision 2).
 */

export const BULLET_SUMMARY_SYSTEM_PROMPT = [
  "You convert scientific paper abstracts into concise bullet-point summaries.",
  "Output STRICTLY a JSON object of the shape:",
  '  { "bullets": string[] }',
  "The \"bullets\" array MUST contain 3 to 5 entries.",
  "Each entry is one phrase or short sentence (<= 25 words).",
  "No prose, no preamble, no markdown, no code fences — just the JSON object.",
].join("\n");

export function renderBulletSummaryUserPrompt(abstract: string): string {
  return `Abstract:\n${abstract}\n\nReturn the JSON object now.`;
}
