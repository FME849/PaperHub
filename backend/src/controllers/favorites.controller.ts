import type { Request, Response } from "express";

import { AuthRequiredError, ValidationFailedError } from "../errors.js";
import { favoritesService } from "../services/favorites.service.js";
import {
  addFavoriteSchema,
  paperIdParamSchema,
} from "../validation/schemas.js";

function requireUserId(req: Request): number {
  if (typeof req.userId !== "number") {
    throw new AuthRequiredError();
  }
  return req.userId;
}

export const favoritesController = {
  async list(req: Request, res: Response): Promise<void> {
    const userId = requireUserId(req);
    const favorites = await favoritesService.list(userId);
    res.status(200).json({ favorites });
  },

  async add(req: Request, res: Response): Promise<void> {
    const userId = requireUserId(req);
    const parsed = addFavoriteSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationFailedError(parsed.error.flatten());
    }
    const { favorite, created } = await favoritesService.add(userId, parsed.data.paperId);
    res.status(created ? 201 : 200).json(favorite);
  },

  async remove(req: Request, res: Response): Promise<void> {
    const userId = requireUserId(req);
    const parsed = paperIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      throw new ValidationFailedError(parsed.error.flatten());
    }
    await favoritesService.remove(userId, parsed.data.paperId);
    res.status(204).end();
  },
};
