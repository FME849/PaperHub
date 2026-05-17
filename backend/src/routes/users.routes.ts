import { Router } from "express";

import { usersController } from "../controllers/users.controller.js";
import { authenticate } from "../middleware/authenticate.js";

export const usersRouter = Router();

usersRouter.use(authenticate);

usersRouter.get("/me", (req, res, next) => {
  usersController.getMe(req, res).catch(next);
});

usersRouter.patch("/me", (req, res, next) => {
  usersController.updateMe(req, res).catch(next);
});

usersRouter.post("/me/password", (req, res, next) => {
  usersController.changePassword(req, res).catch(next);
});
