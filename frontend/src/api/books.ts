import { apiGet } from "./client.ts";
import type { components, paths } from "./schema";

export type Book = components["schemas"]["Book"];
export type BookDetail = components["schemas"]["BookDetail"];
export type PaginatedBookList = components["schemas"]["PaginatedBookList"];
export type BookListParams = NonNullable<
  paths["/api/books/"]["get"]["parameters"]["query"]
>;

export function fetchBooks(params: BookListParams, signal?: AbortSignal) {
  return apiGet<PaginatedBookList>("/api/books/", { query: params, signal });
}

export function fetchBook(id: number, signal?: AbortSignal) {
  return apiGet<BookDetail>(`/api/books/${id}/`, { signal });
}
