import type { Request, Response } from "express";

import { AuthRequiredError, ValidationFailedError } from "../errors.js";
import { papersService } from "../services/papers.service.js";
import { recommendationsService } from "../services/recommendations.service.js";
import {
  paperRouteIdSchema,
  paperRelatedQuerySchema,
} from "../validation/schemas.js";

function requireUserId(req: Request): number {
  if (typeof req.userId !== "number") {
    throw new AuthRequiredError();
  }
  return req.userId;
}

export const paperDetailController = {
  async get(req: Request, res: Response): Promise<void> {
    const userId = requireUserId(req);
    const params = paperRouteIdSchema.safeParse(req.params);
    if (!params.success) {
      throw new ValidationFailedError(params.error.flatten());
    }
    const detail = await papersService.getPaperDetailForUser(userId, params.data.id);
    res.status(200).json(detail);
  },

  async related(req: Request, res: Response): Promise<void> {
    const userId = requireUserId(req);
    const params = paperRouteIdSchema.safeParse(req.params);
    if (!params.success) {
      throw new ValidationFailedError(params.error.flatten());
    }
    const query = paperRelatedQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw new ValidationFailedError(query.error.flatten());
    }
    const result = await recommendationsService.findRelated(
      userId,
      params.data.id,
      query.data.limit,
    );
    res.status(200).json(result);
  },
};
