import { useQuery } from "@tanstack/react-query";
import { fetchBook, fetchBooks } from "../api/books.ts";
import { BOOKS_PAGE_SIZE, type BookListState } from "./listState.ts";

export const bookKeys = {
  list: (params: BookListState) => ["books", "list", params] as const,
  detail: (id: number) => ["books", "detail", id] as const,
};

export function useBookList(params: BookListState) {
  return useQuery({
    queryKey: bookKeys.list(params),
    queryFn: ({ signal }) =>
      fetchBooks({ ...params, page_size: BOOKS_PAGE_SIZE }, signal),
  });
}

export function useBook(id: number) {
  return useQuery({
    queryKey: bookKeys.detail(id),
    queryFn: ({ signal }) => fetchBook(id, signal),
  });
}
