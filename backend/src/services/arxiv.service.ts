import { arxivCategoryFromFilter } from "../config/sources.js";
import { arxivClient, type ArxivPaper } from "../external/arxiv.client.js";

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function toArxivDateString(d: Date): string {
  // arXiv expects YYYYMMDDHHMM (UTC)
  return (
    d.getUTCFullYear().toString() +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes())
  );
}

function escapeKeyword(kw: string): string {
  // arXiv accepts quoted phrases for `all:` field. Escape internal quotes.
  return kw.replace(/"/g, "");
}

function buildKeywordsClause(keywords: string[]): string {
  return keywords.map((k) => `all:"${escapeKeyword(k)}"`).join("+OR+");
}

function buildCategoriesClause(sourceFilters: string[]): string {
  const cats = sourceFilters
    .map(arxivCategoryFromFilter)
    .filter((c): c is string => c !== null);
  return cats.map((c) => `cat:${c}`).join("+OR+");
}

function buildDateClause(windowStart: Date, windowEnd: Date): string {
  return `submittedDate:[${toArxivDateString(windowStart)}+TO+${toArxivDateString(windowEnd)}]`;
}

export interface SearchTopicInput {
  keywords: string[];
  sourceFilters: string[];
  windowStart: Date;
  windowEnd: Date;
  maxResults?: number;
}

export const arxivService = {
  buildSearchQuery(input: SearchTopicInput): string {
    const parts: string[] = [];
    const kw = buildKeywordsClause(input.keywords);
    const cat = buildCategoriesClause(input.sourceFilters);
    const date = buildDateClause(input.windowStart, input.windowEnd);
    if (kw) parts.push(`(${kw})`);
    if (cat) parts.push(`(${cat})`);
    parts.push(date);
    return parts.join("+AND+");
  },

  async searchTopic(input: SearchTopicInput): Promise<ArxivPaper[]> {
    const searchQuery = arxivService.buildSearchQuery(input);
    return arxivClient.search({
      searchQuery,
      maxResults: input.maxResults ?? 200,
    });
  },
};
