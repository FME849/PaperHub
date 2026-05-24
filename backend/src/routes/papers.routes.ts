import { Router } from "express";

import { paperDetailController } from "../controllers/paper-detail.controller.js";
import { authenticate } from "../middleware/authenticate.js";

export const papersRouter = Router();

papersRouter.use(authenticate);

papersRouter.get("/:id/related", (req, res, next) => {
  paperDetailController.related(req, res).catch(next);
});

papersRouter.get("/:id", (req, res, next) => {
  paperDetailController.get(req, res).catch(next);
});
