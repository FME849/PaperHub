import type { Request, Response } from "express";

import { AuthRequiredError, ValidationFailedError } from "../errors.js";
import { notificationsService } from "../services/notifications.service.js";
import { cyclePapersParamSchema, cyclePapersQuerySchema } from "../validation/schemas.js";

function requireUserId(req: Request): number {
  if (typeof req.userId !== "number") {
    throw new AuthRequiredError();
  }
  return req.userId;
}

export const cyclesController = {
  async getCyclePapers(req: Request, res: Response): Promise<void> {
    const userId = requireUserId(req);
    const params = cyclePapersParamSchema.safeParse(req.params);
    if (!params.success) {
      throw new ValidationFailedError(params.error.flatten());
    }
    const query = cyclePapersQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw new ValidationFailedError(query.error.flatten());
    }
    const result = await notificationsService.listCyclePapersForUser(
      userId,
      params.data.cycleId,
      { limit: query.data.limit, cursor: query.data.cursor },
    );
    res.status(200).json(result);
  },
};
