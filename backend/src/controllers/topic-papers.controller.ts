import type { Request, Response } from "express";

import { AuthRequiredError, ValidationFailedError } from "../errors.js";
import { papersService } from "../services/papers.service.js";
import {
  topicPapersParamSchema,
  topicPapersQuerySchema,
} from "../validation/schemas.js";

function requireUserId(req: Request): number {
  if (typeof req.userId !== "number") {
    throw new AuthRequiredError();
  }
  return req.userId;
}

export const topicPapersController = {
  async list(req: Request, res: Response): Promise<void> {
    const userId = requireUserId(req);
    const params = topicPapersParamSchema.safeParse(req.params);
    if (!params.success) {
      throw new ValidationFailedError(params.error.flatten());
    }
    const query = topicPapersQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw new ValidationFailedError(query.error.flatten());
    }
    const result = await papersService.listPapersForTopic(
      userId,
      params.data.topicId,
      query.data,
    );
    res.status(200).json(result);
  },
};
