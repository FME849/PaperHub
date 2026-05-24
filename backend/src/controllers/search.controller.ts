import type { Request, Response } from "express";

import { AuthRequiredError, ValidationFailedError } from "../errors.js";
import { searchService } from "../services/search.service.js";
import { searchPapersQuerySchema } from "../validation/schemas.js";

function requireUserId(req: Request): number {
  if (typeof req.userId !== "number") {
    throw new AuthRequiredError();
  }
  return req.userId;
}

export const searchController = {
  async searchPapers(req: Request, res: Response): Promise<void> {
    const userId = requireUserId(req);
    const parsed = searchPapersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationFailedError(parsed.error.flatten());
    }
    const result = await searchService.searchPapers(userId, parsed.data);
    res.status(200).json(result);
  },
};
