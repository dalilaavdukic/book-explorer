import type { User } from "./auth.ts";
import { apiGet } from "./client.ts";
import type { components, paths } from "./schema";

export type Book = components["schemas"]["Book"];
export type BookDetail = components["schemas"]["BookDetail"];
export type PaginatedBookList = components["schemas"]["PaginatedBookList"];
export type BookListParams = NonNullable<
  paths["/api/books/"]["get"]["parameters"]["query"]
>;

/** `reader` is given only for a list that depends on them (`has_notes`). */
export function fetchBooks(
  params: BookListParams,
  signal?: AbortSignal,
  reader?: User,
) {
  return apiGet<PaginatedBookList>("/api/books/", {
    query: params,
    signal,
    reader,
  });
}

export function fetchBook(id: number, signal?: AbortSignal) {
  return apiGet<BookDetail>(`/api/books/${id}/`, { signal });
}
