import type { NextFunction, Request, Response } from "express";

// Redact sensitive query params (e.g. the unsubscribe HMAC token) before logging.
function redactUrl(url: string): string {
  return url.replace(/([?&]token=)[^&]+/gi, "$1[redacted]");
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${redactUrl(req.originalUrl)} -> ${res.statusCode} ${duration}ms`);
  });
  next();
}
