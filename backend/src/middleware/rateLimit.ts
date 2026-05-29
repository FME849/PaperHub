import type { NextFunction, Request, Response } from "express";

// In-process fixed-window rate limiter. Single-instance only (state is in
// memory and resets on restart); a multi-instance deployment would need a
// shared store. See research.md Decision 4.

interface WindowState {
  count: number;
  windowStart: number;
}

interface LimiterConfig {
  limit: number;
  windowMs: number;
  keyFn: (req: Request) => string;
}

interface Limiter {
  /** Express middleware that responds 429 when the key exceeds the limit. */
  middleware: (req: Request, res: Response, next: NextFunction) => void;
  /** Imperative check: returns true if allowed (and consumes one), false if over the limit. */
  consume: (key: string) => boolean;
}

export function createRateLimiter(config: LimiterConfig): Limiter {
  const buckets = new Map<string, WindowState>();

  function consume(key: string): boolean {
    const now = Date.now();
    const state = buckets.get(key);
    if (!state || now - state.windowStart >= config.windowMs) {
      buckets.set(key, { count: 1, windowStart: now });
      return true;
    }
    if (state.count >= config.limit) {
      return false;
    }
    state.count++;
    return true;
  }

  function middleware(req: Request, res: Response, next: NextFunction): void {
    const allowed = consume(config.keyFn(req));
    if (!allowed) {
      res.status(429).json({ error: "Too many attempts. Please try again later." });
      return;
    }
    next();
  }

  return { middleware, consume };
}

/** SHA-256-free best-effort client IP extraction (proxy-aware). */
export function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0]?.trim() ?? req.ip ?? "unknown";
  }
  return req.ip ?? "unknown";
}
