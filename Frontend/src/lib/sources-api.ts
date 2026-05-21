import { apiFetch } from "@/src/lib/api-client";

export interface ApiSourceFilterValue {
  value: string;
  displayName: string;
}

export interface ApiSource {
  id: string;
  displayName: string;
  filterKey: string;
  filterValues: ApiSourceFilterValue[];
}

export interface ListSourcesResponse {
  sources: ApiSource[];
}

export async function listSources(): Promise<ListSourcesResponse> {
  return apiFetch<ListSourcesResponse>("/api/sources");
}
