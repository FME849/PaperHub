import { Router } from "express";

import { topicsController } from "../controllers/topics.controller.js";
import { topicPapersController } from "../controllers/topic-papers.controller.js";
import { authenticate } from "../middleware/authenticate.js";

export const topicsRouter = Router();

topicsRouter.use(authenticate);

topicsRouter.post("/", (req, res, next) => {
  topicsController.create(req, res).catch(next);
});

topicsRouter.get("/", (req, res, next) => {
  topicsController.list(req, res).catch(next);
});

topicsRouter.get("/:id", (req, res, next) => {
  topicsController.getOne(req, res).catch(next);
});

topicsRouter.patch("/:id", (req, res, next) => {
  topicsController.update(req, res).catch(next);
});

topicsRouter.delete("/:id", (req, res, next) => {
  topicsController.remove(req, res).catch(next);
});

topicsRouter.get("/:topicId/papers", (req, res, next) => {
  topicPapersController.list(req, res).catch(next);
});
