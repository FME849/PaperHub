import type { Request, Response } from "express";

import { AuthRequiredError, ValidationFailedError } from "../errors.js";
import { usersService } from "../services/users.service.js";
import {
  changePasswordSchema,
  updateProfileSchema,
} from "../validation/schemas.js";

function requireUserId(req: Request): number {
  if (typeof req.userId !== "number") {
    throw new AuthRequiredError();
  }
  return req.userId;
}

export const usersController = {
  async getMe(req: Request, res: Response): Promise<void> {
    const userId = requireUserId(req);
    const user = await usersService.getMe(userId);
    res.status(200).json(user);
  },

  async updateMe(req: Request, res: Response): Promise<void> {
    const userId = requireUserId(req);
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationFailedError(parsed.error.flatten());
    }
    const user = await usersService.updateMe(userId, parsed.data);
    res.status(200).json(user);
  },

  async changePassword(req: Request, res: Response): Promise<void> {
    const userId = requireUserId(req);
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationFailedError(parsed.error.flatten());
    }
    await usersService.changePassword(userId, parsed.data);
    res.status(204).end();
  },
};
