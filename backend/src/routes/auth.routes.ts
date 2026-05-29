import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import { env } from "../config/env.js";
import { authController } from "../controllers/auth.controller.js";
import { passwordResetController } from "../controllers/password-reset.controller.js";
import { clientIp, createRateLimiter } from "../middleware/rateLimit.js";
import "../middleware/types.js";

export const authRouter = Router();

authRouter.post("/register", (req, res, next) => {
  authController.register(req, res).catch(next);
});

authRouter.post("/login", (req, res, next) => {
  authController.login(req, res).catch(next);
});

authRouter.post("/logout", authController.logout);

// --- Password reset (005) ---

const forgotEmailLimiter = createRateLimiter({
  limit: env.PASSWORD_RESET_RATE_LIMIT_PER_EMAIL,
  windowMs: env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
  keyFn: (req) => `email:${String(req.body?.email ?? "").toLowerCase()}`,
});
const forgotIpLimiter = createRateLimiter({
  limit: env.PASSWORD_RESET_RATE_LIMIT_PER_IP,
  windowMs: env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
  keyFn: (req) => `ip:${clientIp(req)}`,
});
const verifyIpLimiter = createRateLimiter({
  limit: env.PASSWORD_RESET_RATE_LIMIT_PER_IP,
  windowMs: env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
  keyFn: (req) => `ip:${clientIp(req)}`,
});

// forgot-password is throttled WITHOUT a 429 (a per-account 429 would leak
// existence). Instead we flag the request; the controller returns the neutral
// 200 and skips the send.
function softThrottle(req: Request, _res: Response, next: NextFunction): void {
  const emailKey = `email:${String(req.body?.email ?? "").toLowerCase()}`;
  const ipKey = `ip:${clientIp(req)}`;
  const allowed = forgotEmailLimiter.consume(emailKey) && forgotIpLimiter.consume(ipKey);
  if (!allowed) {
    req.rateLimited = true;
  }
  next();
}

authRouter.post("/forgot-password", softThrottle, (req, res, next) => {
  passwordResetController.forgotPassword(req, res).catch(next);
});

authRouter.get("/reset-password", verifyIpLimiter.middleware, (req, res, next) => {
  passwordResetController.validateToken(req, res).catch(next);
});

authRouter.post("/reset-password", verifyIpLimiter.middleware, (req, res, next) => {
  passwordResetController.resetPassword(req, res).catch(next);
});
