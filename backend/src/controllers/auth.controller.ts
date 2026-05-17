import type { Request, Response } from "express";

import { ValidationFailedError } from "../errors.js";
import { authService } from "../services/auth.service.js";
import { loginSchema, registerSchema } from "../validation/schemas.js";

export const authController = {
  async register(req: Request, res: Response): Promise<void> {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationFailedError(parsed.error.flatten());
    }
    const result = await authService.register(parsed.data);
    res.status(201).json(result);
  },

  async login(req: Request, res: Response): Promise<void> {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationFailedError(parsed.error.flatten());
    }
    const result = await authService.login(parsed.data);
    res.status(200).json(result);
  },

  logout(_req: Request, res: Response): void {
    res.status(204).end();
  },
};
