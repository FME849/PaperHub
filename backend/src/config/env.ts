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

function optionalBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  throw new Error(`Env var ${name} must be a boolean (true/false), got: ${raw}`);
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  JWT_SECRET: required("JWT_SECRET"),
  JWT_TTL: optional("JWT_TTL", "7d"),
  PORT: optionalNumber("PORT", 4000),
  CORS_ORIGIN: optional("CORS_ORIGIN", "http://localhost:3000"),

  FETCH_CRON_EXPR: optional("FETCH_CRON_EXPR", "0 3 * * *"),

  ARXIV_BASE_URL: optional("ARXIV_BASE_URL", "https://export.arxiv.org/api/query"),
  ARXIV_MIN_REQUEST_INTERVAL_MS: optionalNumber("ARXIV_MIN_REQUEST_INTERVAL_MS", 10000),
  ARXIV_MAX_RETRIES: optionalNumber("ARXIV_MAX_RETRIES", 5),

  MAX_TOPICS_PER_USER: optionalNumber("MAX_TOPICS_PER_USER", 20),
  MAX_KEYWORDS_PER_TOPIC: optionalNumber("MAX_KEYWORDS_PER_TOPIC", 15),
  MAX_FILTERS_PER_TOPIC: optionalNumber("MAX_FILTERS_PER_TOPIC", 10),
  MAX_KEYWORD_LENGTH: optionalNumber("MAX_KEYWORD_LENGTH", 80),
  MAX_TOPIC_NAME_LENGTH: optionalNumber("MAX_TOPIC_NAME_LENGTH", 120),
  MAX_NEW_PAPERS_PER_TOPIC_PER_CYCLE: optionalNumber("MAX_NEW_PAPERS_PER_TOPIC_PER_CYCLE", 50),

  INITIAL_FETCH_WINDOW_HOURS: optionalNumber("INITIAL_FETCH_WINDOW_HOURS", 720),

  // AI provider (Gemini v1 default; provider swap stays inside external/ + ai.service)
  GEMINI_API_KEY: optional("GEMINI_API_KEY", "-"),
  GEMINI_MODEL: optional("GEMINI_MODEL", "gemini-2.0-flash"),
  AI_PER_CYCLE_SUMMARY_CAP: optionalNumber("AI_PER_CYCLE_SUMMARY_CAP", 100),
  AI_TIMEOUT_MS: optionalNumber("AI_TIMEOUT_MS", 30000),
  AI_MAX_RETRIES: optionalNumber("AI_MAX_RETRIES", 1),

  // Search & recommendations
  SEARCH_DEFAULT_LIMIT: optionalNumber("SEARCH_DEFAULT_LIMIT", 100),
  SEARCH_MAX_LIMIT: optionalNumber("SEARCH_MAX_LIMIT", 200),
  RECOMMENDATIONS_DEFAULT_LIMIT: optionalNumber("RECOMMENDATIONS_DEFAULT_LIMIT", 20),
  RECOMMENDATIONS_MAX_LIMIT: optionalNumber("RECOMMENDATIONS_MAX_LIMIT", 50),

  // Email notifications (004-paper-email-notifications)
  NOTIFICATIONS_ENABLED: optionalBoolean("NOTIFICATIONS_ENABLED", true),
  SMTP_HOST: optional("SMTP_HOST", "127.0.0.1"),
  SMTP_PORT: optionalNumber("SMTP_PORT", 1025),
  SMTP_SECURE: optionalBoolean("SMTP_SECURE", false),
  SMTP_USER: optional("SMTP_USER", ""),
  SMTP_PASS: optional("SMTP_PASS", ""),
  EMAIL_FROM: optional("EMAIL_FROM", "no-reply@paperhub.local"),
  EMAIL_FROM_NAME: optional("EMAIL_FROM_NAME", "PaperHub"),
  FRONTEND_BASE_URL: optional("FRONTEND_BASE_URL", "http://localhost:3000"),
  PUBLIC_API_BASE_URL: optional("PUBLIC_API_BASE_URL", "http://localhost:4000"),
  UNSUBSCRIBE_TOKEN_SECRET: optional("UNSUBSCRIBE_TOKEN_SECRET", ""),
  DIGEST_TOP_PICKS_COUNT: optionalNumber("DIGEST_TOP_PICKS_COUNT", 3),
  HARD_BOUNCE_THRESHOLD: optionalNumber("HARD_BOUNCE_THRESHOLD", 3),
} as const;

// When notifications are enabled, the unsubscribe-link signing secret is
// mandatory: a missing secret would make every unsubscribe token forgeable.
if (env.NOTIFICATIONS_ENABLED && env.UNSUBSCRIBE_TOKEN_SECRET === "") {
  throw new Error(
    "UNSUBSCRIBE_TOKEN_SECRET is required when NOTIFICATIONS_ENABLED=true. Set a long random value.",
  );
}
