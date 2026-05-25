import type { TrackedTopic } from "@prisma/client";

import { env } from "../config/env.js";
import { isKnownSourceFilter } from "../config/sources.js";
import {
  DuplicateTopicNameError,
  TopicLimitExceededError,
  UnknownSourceFilterError,
  UnknownTopicError,
} from "../errors.js";
import {
  trackedTopicRepository,
  type ListTrackedTopicsQuery,
} from "../repositories/trackedTopic.repository.js";
import { fetchCycleService } from "./fetchCycle.service.js";
import type {
  CreateTopicInput,
  ListTopicsQuery,
  UpdateTopicInput,
} from "../validation/schemas.js";

export interface PublicTrackedTopic {
  id: string;
  name: string;
  keywords: string[];
  sourceFilters: string[];
  lastFetchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListTopicsResult {
  items: PublicTrackedTopic[];
  nextCursor?: string;
}

function normalizeNameLower(name: string): string {
  return name.trim().toLowerCase();
}

function dedupePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

function toJsonStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${field}: expected array, got ${typeof value}.`);
  }
  return value.map((v, i) => {
    if (typeof v !== "string") {
      throw new Error(`Invalid ${field}[${i}]: expected string.`);
    }
    return v;
  });
}

function toPublic(topic: TrackedTopic): PublicTrackedTopic {
  return {
    id: topic.id,
    name: topic.name,
    keywords: toJsonStringArray(topic.keywords, "keywords"),
    sourceFilters: toJsonStringArray(topic.sourceFilters, "sourceFilters"),
    lastFetchedAt: topic.lastFetchedAt ? topic.lastFetchedAt.toISOString() : null,
    createdAt: topic.createdAt.toISOString(),
    updatedAt: topic.updatedAt.toISOString(),
  };
}

function assertKnownSourceFilters(filters: string[]): void {
  const unknown = filters.filter((f) => !isKnownSourceFilter(f));
  if (unknown.length > 0) {
    throw new UnknownSourceFilterError(unknown);
  }
}

function isPrismaUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return code === "P2002";
}

export const topicsService = {
  async createTopic(userId: number, input: CreateTopicInput): Promise<PublicTrackedTopic> {
    const name = input.name.trim();
    const nameLower = normalizeNameLower(name);
    const keywords = dedupePreserveOrder(input.keywords.map((k) => k.trim()));
    const sourceFilters = dedupePreserveOrder(input.sourceFilters.map((s) => s.trim()));

    assertKnownSourceFilters(sourceFilters);

    const current = await trackedTopicRepository.countByUser(userId);
    if (current >= env.MAX_TOPICS_PER_USER) {
      throw new TopicLimitExceededError(env.MAX_TOPICS_PER_USER, current);
    }

    try {
      const created = await trackedTopicRepository.create({
        userId,
        name,
        nameLower,
        keywords,
        sourceFilters,
      });

      // Trigger automatic background fetch cycle so the new topic is immediately populated
      fetchCycleService.run().catch((err) => {
        console.error("[background-fetch] Auto fetch failed for new topic:", err);
      });

      return toPublic(created);
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw new DuplicateTopicNameError(name);
      }
      throw err;
    }
  },

  async listTopicsForUser(userId: number, query: ListTopicsQuery): Promise<ListTopicsResult> {
    const repoQuery: ListTrackedTopicsQuery = {
      userId,
      sort: query.sort,
      order: query.order,
      limit: query.limit,
      cursor: query.cursor,
    };
    const rows = await trackedTopicRepository.findByUser(repoQuery);

    let nextCursor: string | undefined;
    if (rows.length > query.limit) {
      const last = rows[query.limit - 1];
      if (last) nextCursor = last.id;
      rows.length = query.limit;
    }
    return {
      items: rows.map(toPublic),
      ...(nextCursor !== undefined ? { nextCursor } : {}),
    };
  },

  async getTopicForUser(userId: number, id: string): Promise<PublicTrackedTopic> {
    const topic = await trackedTopicRepository.findByIdForUser(userId, id);
    if (!topic) throw new UnknownTopicError();
    return toPublic(topic);
  },

  async updateTopic(
    userId: number,
    id: string,
    input: UpdateTopicInput,
  ): Promise<PublicTrackedTopic> {
    const existing = await trackedTopicRepository.findByIdForUser(userId, id);
    if (!existing) throw new UnknownTopicError();

    const patch: {
      name?: string;
      nameLower?: string;
      keywords?: string[];
      sourceFilters?: string[];
    } = {};

    let newName: string | undefined;
    if (input.name !== undefined) {
      newName = input.name.trim();
      patch.name = newName;
      patch.nameLower = normalizeNameLower(newName);
    }

    if (input.keywords !== undefined) {
      patch.keywords = dedupePreserveOrder(input.keywords.map((k) => k.trim()));
    }

    if (input.sourceFilters !== undefined) {
      const filters = dedupePreserveOrder(input.sourceFilters.map((s) => s.trim()));
      assertKnownSourceFilters(filters);
      patch.sourceFilters = filters;
    }

    try {
      const updated = await trackedTopicRepository.updateForUser(userId, id, patch);
      if (!updated) throw new UnknownTopicError();
      return toPublic(updated);
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw new DuplicateTopicNameError(newName ?? existing.name);
      }
      throw err;
    }
  },

  async deleteTopic(userId: number, id: string): Promise<void> {
    const removed = await trackedTopicRepository.deleteForUser(userId, id);
    if (!removed) throw new UnknownTopicError();
  },

  toPublic,
};
