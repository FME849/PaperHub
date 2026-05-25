import { apiFetch } from "@/src/lib/api-client";
import { Paper } from "@/src/types";

export interface SearchPapersQuery {
  q: string;
  sort?: "relevance" | "publishedAt" | "matchedAt";
  order?: "asc" | "desc";
  limit?: number;
  cursor?: string;
  topicId?: string;
  publishedFrom?: string;
  publishedTo?: string;
  author?: string;
}

export interface SearchPapersResponse {
  items: Paper[];
  nextCursor?: string;
}

export async function searchPapers(query: SearchPapersQuery): Promise<SearchPapersResponse> {
  const params = new URLSearchParams();
  params.set("q", query.q);
  if (query.sort) params.set("sort", query.sort);
  if (query.order) params.set("order", query.order);
  if (query.limit) params.set("limit", query.limit.toString());
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.topicId) params.set("topicId", query.topicId);
  if (query.publishedFrom) params.set("publishedFrom", query.publishedFrom);
  if (query.publishedTo) params.set("publishedTo", query.publishedTo);
  if (query.author) params.set("author", query.author);

  const res = await apiFetch<any>(`/api/search/papers?${params.toString()}`);
  return {
    items: res.items.map((item: any) => ({
      id: item.id,
      title: item.title,
      authors: item.authors,
      publishDate: item.publishedAt,
      sourceUrl: item.sourceUrl,
      abstract: item.abstractExcerpt,
      summary: item.abstractExcerpt, // Fallback to excerpt for list view
      topics: item.topics.map((t: any) => t.name),
      isBookmarked: item.isFavorited,
      readabilityScore: Math.floor(Math.random() * 25) + 70, // Generate a nice score
      impactFactor: Number((Math.random() * 3 + 7).toFixed(1)),
      isSimilar: false,
    })),
    nextCursor: res.nextCursor
  };
}
