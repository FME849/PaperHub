import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { env } from "../config/env.js";
import { AuthRequiredError } from "../errors.js";
import { userRepository } from "../repositories/user.repository.js";
import "./types.js";

interface JwtPayload {
  sub: string;
  iat?: number;
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return next(new AuthRequiredError());
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    return next(new AuthRequiredError());
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload | string;
    if (typeof decoded === "string" || typeof decoded.sub !== "string") {
      return next(new AuthRequiredError());
    }
    const userId = Number(decoded.sub);
    if (!Number.isInteger(userId) || userId <= 0) {
      return next(new AuthRequiredError());
    }

    // Reject tokens minted before the user's last password change, so a reset
    // (or change-password) invalidates all prior sessions (FR-010).
    const user = await userRepository.findById(userId);
    if (!user) {
      return next(new AuthRequiredError());
    }
    if (user.passwordChangedAt && typeof decoded.iat === "number") {
      const changedAtSec = Math.floor(user.passwordChangedAt.getTime() / 1000);
      if (decoded.iat < changedAtSec) {
        return next(new AuthRequiredError());
      }
    }

    req.userId = userId;
    next();
  } catch {
    next(new AuthRequiredError());
  }
}
