import type { Request, Response } from "express";

import { AuthRequiredError, ValidationFailedError } from "../errors.js";
import { emailNotificationPreferenceRepository } from "../repositories/emailNotificationPreference.repository.js";
import { verifyUnsubscribeToken } from "../services/notifications.service.js";
import { updatePreferenceSchema, unsubscribeQuerySchema } from "../validation/schemas.js";

function requireUserId(req: Request): number {
  if (typeof req.userId !== "number") {
    throw new AuthRequiredError();
  }
  return req.userId;
}

function unsubscribePage(message: string, sub: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>PaperHub</title>
    <meta name="robots" content="noindex">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body{font-family:system-ui,-apple-system,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#222}h1{font-size:1.4rem}p{color:#555;line-height:1.5}</style>
  </head>
  <body>
    <h1>${message}</h1>
    <p>${sub}</p>
  </body>
</html>`;
}

export const notificationsController = {
  async getPreference(req: Request, res: Response): Promise<void> {
    const userId = requireUserId(req);
    const pref = await emailNotificationPreferenceRepository.getByUserId(userId);
    if (!pref) {
      res.status(200).json({ enabled: false, lastChangedAt: null, lastChangedVia: null });
      return;
    }
    res.status(200).json({
      enabled: pref.enabled,
      lastChangedAt: pref.lastChangedAt.toISOString(),
      lastChangedVia: pref.lastChangedVia,
    });
  },

  async putPreference(req: Request, res: Response): Promise<void> {
    const userId = requireUserId(req);
    const parsed = updatePreferenceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationFailedError(parsed.error.flatten());
    }
    const pref = await emailNotificationPreferenceRepository.upsert(
      userId,
      parsed.data.enabled,
      "SETTINGS_UI",
    );
    res.status(200).json({
      enabled: pref.enabled,
      lastChangedAt: pref.lastChangedAt.toISOString(),
      lastChangedVia: pref.lastChangedVia,
    });
  },

  // Unauthenticated. Authorisation is the HMAC token, not a session.
  async getUnsubscribe(req: Request, res: Response): Promise<void> {
    res.setHeader("Content-Type", "text/html; charset=utf-8");

    const parsed = unsubscribeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).send(
        unsubscribePage(
          "This unsubscribe link is invalid or expired.",
          "If you'd like to stop receiving emails, please log in to PaperHub and update your notification preference.",
        ),
      );
      return;
    }

    const userId = verifyUnsubscribeToken(parsed.data.token);
    if (userId === null) {
      res.status(400).send(
        unsubscribePage(
          "This unsubscribe link is invalid or expired.",
          "If you'd like to stop receiving emails, please log in to PaperHub and update your notification preference.",
        ),
      );
      return;
    }

    await emailNotificationPreferenceRepository.upsert(userId, false, "UNSUBSCRIBE_LINK");
    res.status(200).send(
      unsubscribePage(
        "You're unsubscribed",
        "You will no longer receive PaperHub paper-digest emails. You can re-enable them anytime from your account settings.",
      ),
    );
  },
};
