import type { Paper, Prisma } from "@prisma/client";

import { prisma } from "../db.js";

export interface UpsertPaperInput {
  primarySource: string;
  sourcePaperId: string;
  title: string;
  abstract: string;
  authors: string[];
  sourceUrl: string;
  publishedAt: Date;
}

export const paperRepository = {
  findById(id: string): Promise<Paper | null> {
    return prisma.paper.findUnique({ where: { id } });
  },

  findBySource(primarySource: string, sourcePaperId: string): Promise<Paper | null> {
    return prisma.paper.findUnique({
      where: { primarySource_sourcePaperId: { primarySource, sourcePaperId } },
    });
  },

  upsertBySource(input: UpsertPaperInput): Promise<Paper> {
    return prisma.paper.upsert({
      where: {
        primarySource_sourcePaperId: {
          primarySource: input.primarySource,
          sourcePaperId: input.sourcePaperId,
        },
      },
      update: {},
      create: {
        primarySource: input.primarySource,
        sourcePaperId: input.sourcePaperId,
        title: input.title,
        abstract: input.abstract,
        authors: input.authors as unknown as Prisma.InputJsonValue,
        sourceUrl: input.sourceUrl,
        publishedAt: input.publishedAt,
      },
    });
  },
};
