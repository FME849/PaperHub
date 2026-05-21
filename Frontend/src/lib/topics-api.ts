import { apiFetch } from "@/src/lib/api-client";

export interface ApiTopic {
  id: string;
  name: string;
  keywords: string[];
  sourceFilters: string[];
  lastFetchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListTopicsResponse {
  items: ApiTopic[];
  nextCursor?: string;
}

export async function listTopics(): Promise<ListTopicsResponse> {
  return apiFetch<ListTopicsResponse>("/api/topics");
}

export async function createTopic(body: {
  name: string;
  keywords: string[];
  sourceFilters: string[];
}): Promise<ApiTopic> {
  return apiFetch<ApiTopic>("/api/topics", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateTopic(id: string, body: {
  name?: string;
  keywords?: string[];
  sourceFilters?: string[];
}): Promise<ApiTopic> {
  return apiFetch<ApiTopic>(`/api/topics/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteTopic(id: string): Promise<void> {
  await apiFetch<void>(`/api/topics/${id}`, {
    method: "DELETE",
  });
}

export interface ApiTopicPaper {
  id: string;
  topicId: string;
  title: string;
  abstract: string;
  url: string;
  authors: string[];
  publishedAt: string;
  source: string;
  createdAt: string;
}

export interface ListTopicPapersResponse {
  items: ApiTopicPaper[];
  nextCursor?: string;
}

export async function listTopicPapers(topicId: string, query: { limit?: number; cursor?: string } = {}): Promise<ListTopicPapersResponse> {
  const params = new URLSearchParams();
  if (query.limit) params.set("limit", query.limit.toString());
  if (query.cursor) params.set("cursor", query.cursor);
  const qs = params.toString();
  return apiFetch<ListTopicPapersResponse>(`/api/topics/${topicId}/papers${qs ? `?${qs}` : ""}`);
}
