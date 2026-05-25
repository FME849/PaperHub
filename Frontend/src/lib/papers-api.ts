import { apiFetch } from "@/src/lib/api-client";
import { Paper } from "@/src/types";

export async function getPaperDetail(id: string): Promise<Paper> {
  return apiFetch<Paper>(`/api/papers/${encodeURIComponent(id)}`);
}

export async function getRelatedPapers(id: string): Promise<{ items: Paper[] }> {
  return apiFetch<{ items: Paper[] }>(`/api/papers/${encodeURIComponent(id)}/related`);
}
