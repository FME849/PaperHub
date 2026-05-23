import { Router } from "express";

import { searchController } from "../controllers/search.controller.js";
import { authenticate } from "../middleware/authenticate.js";

export const searchRouter = Router();

searchRouter.use(authenticate);

searchRouter.get("/papers", (req, res, next) => {
  searchController.searchPapers(req, res).catch(next);
});
