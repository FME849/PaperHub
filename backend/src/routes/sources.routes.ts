import { Router } from "express";

import { sourcesController } from "../controllers/sources.controller.js";
import { authenticate } from "../middleware/authenticate.js";

export const sourcesRouter = Router();

sourcesRouter.use(authenticate);

sourcesRouter.get("/", (req, res) => {
  sourcesController.list(req, res);
});
