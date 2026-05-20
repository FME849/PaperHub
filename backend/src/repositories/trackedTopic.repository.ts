import type { Prisma, TrackedTopic } from "@prisma/client";

import { prisma } from "../db.js";

export interface CreateTrackedTopicInput {
  userId: number;
  name: string;
  nameLower: string;
  keywords: string[];
  sourceFilters: string[];
}

export interface UpdateTrackedTopicInput {
  name?: string;
  nameLower?: string;
  keywords?: string[];
  sourceFilters?: string[];
}

export type TrackedTopicSortKey = "createdAt" | "updatedAt" | "name";
export type SortOrder = "asc" | "desc";

export interface ListTrackedTopicsQuery {
  userId: number;
  sort: TrackedTopicSortKey;
  order: SortOrder;
  limit: number;
  cursor?: string;
}

export const trackedTopicRepository = {
  create(input: CreateTrackedTopicInput): Promise<TrackedTopic> {
    return prisma.trackedTopic.create({
      data: {
        userId: input.userId,
        name: input.name,
        nameLower: input.nameLower,
        keywords: input.keywords as unknown as Prisma.InputJsonValue,
        sourceFilters: input.sourceFilters as unknown as Prisma.InputJsonValue,
      },
    });
  },

  countByUser(userId: number): Promise<number> {
    return prisma.trackedTopic.count({ where: { userId } });
  },

  findByUserAndNameLower(userId: number, nameLower: string): Promise<TrackedTopic | null> {
    return prisma.trackedTopic.findUnique({
      where: { userId_nameLower: { userId, nameLower } },
    });
  },

  findByIdForUser(userId: number, id: string): Promise<TrackedTopic | null> {
    return prisma.trackedTopic.findFirst({ where: { id, userId } });
  },

  async findByUser(query: ListTrackedTopicsQuery): Promise<TrackedTopic[]> {
    const { userId, sort, order, limit, cursor } = query;
    return prisma.trackedTopic.findMany({
      where: { userId },
      orderBy: [{ [sort]: order }, { id: order }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  },

  async updateForUser(
    userId: number,
    id: string,
    patch: UpdateTrackedTopicInput,
  ): Promise<TrackedTopic | null> {
    const result = await prisma.trackedTopic.updateMany({
      where: { id, userId },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.nameLower !== undefined ? { nameLower: patch.nameLower } : {}),
        ...(patch.keywords !== undefined
          ? { keywords: patch.keywords as unknown as Prisma.InputJsonValue }
          : {}),
        ...(patch.sourceFilters !== undefined
          ? { sourceFilters: patch.sourceFilters as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
    if (result.count === 0) return null;
    return prisma.trackedTopic.findUnique({ where: { id } });
  },

  async deleteForUser(userId: number, id: string): Promise<boolean> {
    const result = await prisma.trackedTopic.deleteMany({ where: { id, userId } });
    return result.count > 0;
  },

  listAllActive(): Promise<TrackedTopic[]> {
    return prisma.trackedTopic.findMany({ orderBy: { createdAt: "asc" } });
  },

  async setLastFetchedAt(topicId: string, when: Date): Promise<boolean> {
    const result = await prisma.trackedTopic.updateMany({
      where: { id: topicId },
      data: { lastFetchedAt: when },
    });
    return result.count > 0;
  },

  findById(id: string): Promise<TrackedTopic | null> {
    return prisma.trackedTopic.findUnique({ where: { id } });
  },
};
