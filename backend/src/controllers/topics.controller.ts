import type { Request, Response } from "express";

import { AuthRequiredError, ValidationFailedError } from "../errors.js";
import { topicsService } from "../services/topics.service.js";
import {
  createTopicSchema,
  listTopicsQuerySchema,
  topicIdParamSchema,
  updateTopicSchema,
} from "../validation/schemas.js";

function requireUserId(req: Request): number {
  if (typeof req.userId !== "number") {
    throw new AuthRequiredError();
  }
  return req.userId;
}

export const topicsController = {
  async create(req: Request, res: Response): Promise<void> {
    const userId = requireUserId(req);
    const parsed = createTopicSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationFailedError(parsed.error.flatten());
    }
    const topic = await topicsService.createTopic(userId, parsed.data);
    res.status(201).json(topic);
  },

  async list(req: Request, res: Response): Promise<void> {
    const userId = requireUserId(req);
    const parsed = listTopicsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationFailedError(parsed.error.flatten());
    }
    const result = await topicsService.listTopicsForUser(userId, parsed.data);
    res.status(200).json(result);
  },

  async getOne(req: Request, res: Response): Promise<void> {
    const userId = requireUserId(req);
    const params = topicIdParamSchema.safeParse(req.params);
    if (!params.success) {
      throw new ValidationFailedError(params.error.flatten());
    }
    const topic = await topicsService.getTopicForUser(userId, params.data.id);
    res.status(200).json(topic);
  },

  async update(req: Request, res: Response): Promise<void> {
    const userId = requireUserId(req);
    const params = topicIdParamSchema.safeParse(req.params);
    if (!params.success) {
      throw new ValidationFailedError(params.error.flatten());
    }
    const body = updateTopicSchema.safeParse(req.body);
    if (!body.success) {
      throw new ValidationFailedError(body.error.flatten());
    }
    const topic = await topicsService.updateTopic(userId, params.data.id, body.data);
    res.status(200).json(topic);
  },

  async remove(req: Request, res: Response): Promise<void> {
    const userId = requireUserId(req);
    const params = topicIdParamSchema.safeParse(req.params);
    if (!params.success) {
      throw new ValidationFailedError(params.error.flatten());
    }
    await topicsService.deleteTopic(userId, params.data.id);
    res.status(204).end();
  },
};
