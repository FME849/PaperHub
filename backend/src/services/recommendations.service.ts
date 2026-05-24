import { env } from "../config/env.js";
import { prisma } from "../db.js";
import { UnknownPaperError } from "../errors.js";
import { paperRepository } from "../repositories/paper.repository.js";

interface CandidatePaper {
  id: string;
  title: string;
  abstract: string;
  authors: string[];
  publishedAt: Date;
  sourceUrl: string;
  topics: Array<{ id: string; name: string }>;
  categories: string[];
}

export type RecommendationReason =
  | "shared_topic"
  | "shared_author"
  | "shared_category"
  | "lexical_similarity";

export interface RecommendationItem {
  id: string;
  title: string;
  authors: string[];
  publishedAt: string;
  sourceUrl: string;
  summaryAvailable: boolean;
  isFavorited: boolean;
  topics: Array<{ id: string; name: string }>;
  score: number;
  reasons: RecommendationReason[];
}

export interface FindRelatedResult {
  origin: { id: string; title: string };
  items: RecommendationItem[];
}

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "of", "in", "on", "for",
  "with", "to", "from", "by", "is", "are", "was", "were", "be", "been", "being",
  "this", "that", "these", "those", "it", "its", "we", "our", "they", "their",
  "as", "at", "into", "via", "using", "use", "based", "model", "models", "paper",
  "show", "present", "propose", "method", "methods", "result", "results",
]);

const WEIGHTS = {
  topic: 3,
  author: 2,
  category: 1,
  lexical: 2,
  agePenalty: 0.5,
};

function toJsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }
  return tf;
}

function buildIdf(corpus: string[][]): Map<string, number> {
  const df = new Map<string, number>();
  for (const tokens of corpus) {
    const seen = new Set<string>();
    for (const t of tokens) {
      if (!seen.has(t)) {
        seen.add(t);
        df.set(t, (df.get(t) ?? 0) + 1);
      }
    }
  }
  const n = corpus.length || 1;
  const idf = new Map<string, number>();
  for (const [term, count] of df) {
    idf.set(term, Math.log((n + 1) / (count + 1)) + 1);
  }
  return idf;
}

function tfidfVector(tf: Map<string, number>, idf: Map<string, number>): Map<string, number> {
  const v = new Map<string, number>();
  for (const [term, freq] of tf) {
    const w = idf.get(term) ?? 0;
    if (w > 0) v.set(term, freq * w);
  }
  return v;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (const [term, weight] of a) {
    aMag += weight * weight;
    const bw = b.get(term);
    if (bw !== undefined) dot += weight * bw;
  }
  for (const weight of b.values()) bMag += weight * weight;
  if (aMag === 0 || bMag === 0) return 0;
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
}

function ageInDays(publishedAt: Date, now: Date): number {
  const ms = Math.max(0, now.getTime() - publishedAt.getTime());
  return ms / (1000 * 60 * 60 * 24);
}

async function loadCandidates(userId: number, originPaperId: string): Promise<CandidatePaper[]> {
  const rows = await prisma.topicPaperMatch.findMany({
    where: { trackedTopic: { userId }, NOT: { paperId: originPaperId } },
    select: {
      paper: {
        select: {
          id: true,
          title: true,
          abstract: true,
          authors: true,
          sourceUrl: true,
          publishedAt: true,
        },
      },
      trackedTopic: { select: { id: true, name: true, sourceFilters: true } },
    },
  });

  const byId = new Map<string, CandidatePaper>();
  for (const row of rows) {
    if (!row.paper || !row.trackedTopic) continue;
    const existing = byId.get(row.paper.id);
    const categories = toJsonStringArray(row.trackedTopic.sourceFilters);
    if (existing) {
      if (!existing.topics.some((t) => t.id === row.trackedTopic!.id)) {
        existing.topics.push({ id: row.trackedTopic.id, name: row.trackedTopic.name });
      }
      for (const c of categories) {
        if (!existing.categories.includes(c)) existing.categories.push(c);
      }
    } else {
      byId.set(row.paper.id, {
        id: row.paper.id,
        title: row.paper.title,
        abstract: row.paper.abstract,
        authors: toJsonStringArray(row.paper.authors),
        sourceUrl: row.paper.sourceUrl,
        publishedAt: row.paper.publishedAt,
        topics: [{ id: row.trackedTopic.id, name: row.trackedTopic.name }],
        categories,
      });
    }
  }
  return [...byId.values()];
}

async function loadOriginContext(
  userId: number,
  originPaperId: string,
): Promise<{
  paper: { id: string; title: string; abstract: string; authors: string[] };
  topicIds: Set<string>;
  categories: Set<string>;
}> {
  const rows = await prisma.topicPaperMatch.findMany({
    where: { paperId: originPaperId, trackedTopic: { userId } },
    select: {
      paper: {
        select: { id: true, title: true, abstract: true, authors: true },
      },
      trackedTopic: { select: { id: true, sourceFilters: true } },
    },
  });

  let paper: { id: string; title: string; abstract: string; authors: string[] } | null = null;
  const topicIds = new Set<string>();
  const categories = new Set<string>();
  for (const row of rows) {
    if (!paper && row.paper) {
      paper = {
        id: row.paper.id,
        title: row.paper.title,
        abstract: row.paper.abstract,
        authors: toJsonStringArray(row.paper.authors),
      };
    }
    if (row.trackedTopic) {
      topicIds.add(row.trackedTopic.id);
      for (const c of toJsonStringArray(row.trackedTopic.sourceFilters)) {
        categories.add(c);
      }
    }
  }

  // Origin may be in the user's catalog via Favorite only (not topic) — fall
  // back to the bare Paper row in that case. Topic / category overlap signals
  // will be empty; lexical similarity still works.
  if (!paper) {
    const bare = await paperRepository.findById(originPaperId);
    if (bare) {
      paper = {
        id: bare.id,
        title: bare.title,
        abstract: bare.abstract,
        authors: toJsonStringArray(bare.authors),
      };
    }
  }

  if (!paper) throw new UnknownPaperError();
  return { paper, topicIds, categories };
}

export const recommendationsService = {
  async findRelated(
    userId: number,
    originPaperId: string,
    limit: number,
  ): Promise<FindRelatedResult> {
    // Access gate — origin must be in the user's catalog OR favourited.
    const accessible = await paperRepository.findByIdAccessibleToUser(userId, originPaperId);
    if (!accessible) throw new UnknownPaperError();

    const origin = await loadOriginContext(userId, originPaperId);
    const candidates = await loadCandidates(userId, originPaperId);

    if (candidates.length === 0) {
      return { origin: { id: origin.paper.id, title: origin.paper.title }, items: [] };
    }

    // Build TF-IDF over user's catalog (origin + candidates).
    const corpus = [
      tokenize(`${origin.paper.title} ${origin.paper.abstract}`),
      ...candidates.map((c) => tokenize(`${c.title} ${c.abstract}`)),
    ];
    const idf = buildIdf(corpus);
    const originVec = tfidfVector(termFreq(corpus[0]!), idf);

    const originAuthors = new Set(origin.paper.authors.map((a) => a.toLowerCase()));
    const now = new Date();

    const scored = candidates.map((c, idx) => {
      const candTokens = corpus[idx + 1]!;
      const candVec = tfidfVector(termFreq(candTokens), idf);
      const lexicalSim = cosine(originVec, candVec);

      const sharedTopics = c.topics.filter((t) => origin.topicIds.has(t.id)).length;
      const sharedAuthors = c.authors.filter((a) => originAuthors.has(a.toLowerCase())).length;
      const sharedCategories = c.categories.filter((cat) => origin.categories.has(cat)).length;

      const score =
        WEIGHTS.topic * sharedTopics +
        WEIGHTS.author * sharedAuthors +
        WEIGHTS.category * sharedCategories +
        WEIGHTS.lexical * lexicalSim -
        WEIGHTS.agePenalty * Math.log1p(ageInDays(c.publishedAt, now));

      const reasons: RecommendationReason[] = [];
      if (sharedTopics > 0) reasons.push("shared_topic");
      if (sharedAuthors > 0) reasons.push("shared_author");
      if (sharedCategories > 0) reasons.push("shared_category");
      if (lexicalSim > 0.05) reasons.push("lexical_similarity");

      return { candidate: c, score, reasons };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, limit);

    // Per-row sidecars: isFavorited + summaryAvailable.
    const items: RecommendationItem[] = await Promise.all(
      top.map(async (entry) => {
        const [favorite, summary] = await Promise.all([
          prisma.favorite.findUnique({
            where: { userId_paperId: { userId, paperId: entry.candidate.id } },
            select: { id: true },
          }),
          prisma.paperSummary.findUnique({
            where: { paperId: entry.candidate.id },
            select: { status: true },
          }),
        ]);
        return {
          id: entry.candidate.id,
          title: entry.candidate.title,
          authors: entry.candidate.authors,
          publishedAt: entry.candidate.publishedAt.toISOString(),
          sourceUrl: entry.candidate.sourceUrl,
          summaryAvailable: summary?.status === "SUCCEEDED",
          isFavorited: favorite !== null,
          topics: entry.candidate.topics,
          score: Number(entry.score.toFixed(3)),
          reasons: entry.reasons,
        };
      }),
    );

    // Save unused env reference — silence the linter if RECOMMENDATIONS_* are not used elsewhere.
    void env.RECOMMENDATIONS_DEFAULT_LIMIT;

    return {
      origin: { id: origin.paper.id, title: origin.paper.title },
      items,
    };
  },
};
