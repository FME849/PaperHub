import { Router } from "express";

import { cyclesController } from "../controllers/cycles.controller.js";
import { notificationsController } from "../controllers/notifications.controller.js";
import { authenticate } from "../middleware/authenticate.js";

export const notificationsRouter = Router();

// Unauthenticated: the one-click unsubscribe link must work without a session.
// Authorisation is the HMAC token. Mounted BEFORE `authenticate`.
notificationsRouter.get("/unsubscribe", (req, res, next) => {
  notificationsController.getUnsubscribe(req, res).catch(next);
});

// Everything below requires a valid JWT.
notificationsRouter.use(authenticate);

notificationsRouter.get("/preference", (req, res, next) => {
  notificationsController.getPreference(req, res).catch(next);
});

notificationsRouter.put("/preference", (req, res, next) => {
  notificationsController.putPreference(req, res).catch(next);
});

notificationsRouter.get("/cycles/:cycleId/papers", (req, res, next) => {
  cyclesController.getCyclePapers(req, res).catch(next);
});
