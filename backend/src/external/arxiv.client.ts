import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

import { env } from "../config/env.js";
import { ArxivClientError, ArxivResponseShapeError } from "../errors.js";

const arxivAuthorSchema = z.union([
  z.object({ name: z.string() }),
  z.array(z.object({ name: z.string() })),
]);

const arxivEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  published: z.string(),
  updated: z.string().optional(),
  author: arxivAuthorSchema.optional(),
  link: z
    .union([
      z.object({ "@_href": z.string().optional(), "@_rel": z.string().optional() }),
      z.array(
        z.object({ "@_href": z.string().optional(), "@_rel": z.string().optional() }),
      ),
    ])
    .optional(),
});

const arxivFeedSchema = z.object({
  feed: z.object({
    entry: z.union([arxivEntrySchema, z.array(arxivEntrySchema)]).optional(),
  }),
});

export interface ArxivPaper {
  /** Version-stripped arXiv id (e.g., "2403.04102"). */
  sourcePaperId: string;
  title: string;
  abstract: string;
  authors: string[];
  sourceUrl: string;
  publishedAt: Date;
}

export interface ArxivSearchQuery {
  searchQuery: string;
  maxResults?: number;
  start?: number;
}

let lastRequestAt = 0;

async function honourMinInterval(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  const wait = env.ARXIV_MIN_REQUEST_INTERVAL_MS - elapsed;
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestAt = Date.now();
}

function withFullJitter(baseMs: number): number {
  return Math.floor(Math.random() * baseMs);
}

function stripVersion(arxivId: string): string {
  return arxivId.replace(/v\d+$/, "");
}

function extractArxivIdFromIdField(idField: string): string {
  const match = idField.match(/abs\/([^/?#]+)$/);
  if (match && match[1]) return stripVersion(match[1]);
  return stripVersion(idField);
}

function extractAbsUrl(entry: z.infer<typeof arxivEntrySchema>): string {
  const link = entry.link;
  if (Array.isArray(link)) {
    for (const l of link) {
      if (l["@_rel"] === "alternate" && l["@_href"]) return l["@_href"];
    }
    if (link[0] && link[0]["@_href"]) return link[0]["@_href"];
  } else if (link && link["@_href"]) {
    return link["@_href"];
  }
  return entry.id;
}

function extractAuthors(entry: z.infer<typeof arxivEntrySchema>): string[] {
  const author = entry.author;
  if (!author) return [];
  if (Array.isArray(author)) {
    return author.map((a) => a.name.trim()).filter((n) => n.length > 0);
  }
  return [author.name.trim()].filter((n) => n.length > 0);
}

function entryToPaper(entry: z.infer<typeof arxivEntrySchema>): ArxivPaper {
  const sourcePaperId = extractArxivIdFromIdField(entry.id);
  const publishedAt = new Date(entry.published);
  if (Number.isNaN(publishedAt.getTime())) {
    throw new ArxivResponseShapeError({
      reason: "invalid_published_date",
      value: entry.published,
    });
  }
  return {
    sourcePaperId,
    title: entry.title.replace(/\s+/g, " ").trim(),
    abstract: entry.summary.replace(/\s+/g, " ").trim(),
    authors: extractAuthors(entry),
    sourceUrl: extractAbsUrl(entry),
    publishedAt,
  };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

async function fetchOnce(url: string): Promise<Response> {
  return fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: {
      "User-Agent": "paperhub-fetcher/0.1 (mailto:lehaoson@gmail.com)",
      Accept: "application/atom+xml",
    },
  });
}

async function fetchWithRetries(url: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < env.ARXIV_MAX_RETRIES; attempt++) {
    await honourMinInterval();
    try {
      const res = await fetchOnce(url);
      if (res.ok) {
        return await res.text();
      }
      if (res.status >= 500 || res.status === 429) {
        lastError = new ArxivClientError(`arxiv ${res.status}`, { status: res.status });
      } else {
        throw new ArxivClientError(`arxiv ${res.status}`, { status: res.status });
      }
    } catch (err) {
      lastError = err;
    }
    if (attempt < env.ARXIV_MAX_RETRIES - 1) {
      const base = 5000 * Math.pow(3, attempt);
      const delay = withFullJitter(base);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  if (lastError instanceof ArxivClientError) throw lastError;
  throw new ArxivClientError("arxiv unreachable", { cause: String(lastError) });
}

export const arxivClient = {
  async search(query: ArxivSearchQuery): Promise<ArxivPaper[]> {
    const params = new URLSearchParams({
      search_query: query.searchQuery,
      start: String(query.start ?? 0),
      max_results: String(query.maxResults ?? 200),
      sortBy: "submittedDate",
      sortOrder: "descending",
    });
    const url = `${env.ARXIV_BASE_URL}?${params.toString()}`;
    console.log(`[arxiv-client] GET ${url}`);
    const xml = await fetchWithRetries(url);

    let parsed: unknown;
    try {
      parsed = parser.parse(xml);
    } catch (err) {
      throw new ArxivResponseShapeError({ reason: "xml_parse_failed", cause: String(err) });
    }

    const result = arxivFeedSchema.safeParse(parsed);
    if (!result.success) {
      throw new ArxivResponseShapeError({ issues: result.error.flatten() });
    }

    const entry = result.data.feed.entry;
    if (!entry) return [];
    const entries = Array.isArray(entry) ? entry : [entry];
    return entries.map(entryToPaper);
  },
};
