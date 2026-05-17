import { Router } from "express";

import { authController } from "../controllers/auth.controller.js";

export const authRouter = Router();

authRouter.post("/register", (req, res, next) => {
  authController.register(req, res).catch(next);
});

authRouter.post("/login", (req, res, next) => {
  authController.login(req, res).catch(next);
});

authRouter.post("/logout", authController.logout);
