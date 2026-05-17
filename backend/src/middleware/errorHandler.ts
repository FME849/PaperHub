import type { NextFunction, Request, Response } from "express";

import { DomainError } from "../errors.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof DomainError) {
    const body: { error: string; details?: unknown } = { error: err.message };
    if (err.details !== undefined) body.details = err.details;
    res.status(err.status).json(body);
    return;
  }

  console.error("[errorHandler] unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
}
