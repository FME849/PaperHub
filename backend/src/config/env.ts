import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Env var ${name} must be a number, got: ${raw}`);
  }
  return parsed;
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  JWT_SECRET: required("JWT_SECRET"),
  JWT_TTL: optional("JWT_TTL", "7d"),
  PORT: optionalNumber("PORT", 4000),
  CORS_ORIGIN: optional("CORS_ORIGIN", "http://localhost:3000"),

  FETCH_CRON_EXPR: optional("FETCH_CRON_EXPR", "0 3 * * *"),

  ARXIV_BASE_URL: optional("ARXIV_BASE_URL", "https://export.arxiv.org/api/query"),
  ARXIV_MIN_REQUEST_INTERVAL_MS: optionalNumber("ARXIV_MIN_REQUEST_INTERVAL_MS", 3000),
  ARXIV_MAX_RETRIES: optionalNumber("ARXIV_MAX_RETRIES", 3),

  MAX_TOPICS_PER_USER: optionalNumber("MAX_TOPICS_PER_USER", 20),
  MAX_KEYWORDS_PER_TOPIC: optionalNumber("MAX_KEYWORDS_PER_TOPIC", 15),
  MAX_FILTERS_PER_TOPIC: optionalNumber("MAX_FILTERS_PER_TOPIC", 10),
  MAX_KEYWORD_LENGTH: optionalNumber("MAX_KEYWORD_LENGTH", 80),
  MAX_TOPIC_NAME_LENGTH: optionalNumber("MAX_TOPIC_NAME_LENGTH", 120),
  MAX_NEW_PAPERS_PER_TOPIC_PER_CYCLE: optionalNumber("MAX_NEW_PAPERS_PER_TOPIC_PER_CYCLE", 200),

  INITIAL_FETCH_WINDOW_HOURS: optionalNumber("INITIAL_FETCH_WINDOW_HOURS", 24),

  // AI provider (Gemini v1 default; provider swap stays inside external/ + ai.service)
  GEMINI_API_KEY: optional("GEMINI_API_KEY", ""),
  GEMINI_MODEL: optional("GEMINI_MODEL", "gemini-2.0-flash"),
  AI_PER_CYCLE_SUMMARY_CAP: optionalNumber("AI_PER_CYCLE_SUMMARY_CAP", 100),
  AI_TIMEOUT_MS: optionalNumber("AI_TIMEOUT_MS", 30000),
  AI_MAX_RETRIES: optionalNumber("AI_MAX_RETRIES", 1),

  // Search & recommendations
  SEARCH_DEFAULT_LIMIT: optionalNumber("SEARCH_DEFAULT_LIMIT", 100),
  SEARCH_MAX_LIMIT: optionalNumber("SEARCH_MAX_LIMIT", 200),
  RECOMMENDATIONS_DEFAULT_LIMIT: optionalNumber("RECOMMENDATIONS_DEFAULT_LIMIT", 20),
  RECOMMENDATIONS_MAX_LIMIT: optionalNumber("RECOMMENDATIONS_MAX_LIMIT", 50),
} as const;
