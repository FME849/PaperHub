import { Router } from "express";

import { favoritesController } from "../controllers/favorites.controller.js";
import { authenticate } from "../middleware/authenticate.js";

export const favoritesRouter = Router();

favoritesRouter.use(authenticate);

favoritesRouter.get("/", (req, res, next) => {
  favoritesController.list(req, res).catch(next);
});

favoritesRouter.get("/papers", (req, res, next) => {
  favoritesController.listPapers(req, res).catch(next);
});

favoritesRouter.post("/", (req, res, next) => {
  favoritesController.add(req, res).catch(next);
});

favoritesRouter.delete("/:paperId", (req, res, next) => {
  favoritesController.remove(req, res).catch(next);
});
