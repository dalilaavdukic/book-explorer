import { apiGet } from "./client.ts";
import type { components } from "./schema";

export type Genre = components["schemas"]["Genre"];

export function fetchGenres(signal?: AbortSignal) {
  return apiGet<Genre[]>("/api/genres/", { signal });
}
