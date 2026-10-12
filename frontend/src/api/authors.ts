import { apiGet } from "./client.ts";
import type { components, paths } from "./schema";

export type Author = components["schemas"]["Author"];
export type AuthorListParams = NonNullable<
  paths["/api/authors/"]["get"]["parameters"]["query"]
>;

export function fetchAuthors(params: AuthorListParams, signal?: AbortSignal) {
  return apiGet<Author[]>("/api/authors/", { query: params, signal });
}

export function fetchAuthor(id: number, signal?: AbortSignal) {
  return apiGet<Author>(`/api/authors/${id}/`, { signal });
}
