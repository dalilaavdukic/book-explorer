import {
  type QueryFunction,
  queryOptions,
  useQuery,
} from "@tanstack/react-query";
import type { User } from "../api/auth.ts";
import {
  type BookListParams,
  fetchBook,
  fetchBooks,
  type PaginatedBookList,
} from "../api/books.ts";
import { privateQueryOptions, useAuth } from "../auth/session.ts";
import { BOOKS_PAGE_SIZE, type BookListState } from "./listState.ts";

export const bookKeys = {
  list: (state: BookListState) => ["books", "list", state] as const,
  detail: (id: number) => ["books", "detail", id] as const,
};

// Defaults are left out, so the request matches the URL the reader sees.
function bookListParams(state: BookListState): BookListParams {
  return {
    page: state.page,
    page_size: BOOKS_PAGE_SIZE,
    search: state.search || undefined,
    author: state.author ?? undefined,
    genre: state.genre,
    has_notes: state.has_notes ? "true" : undefined,
    sort: state.sort === "title" ? undefined : state.sort,
  };
}

/** The one place that decides whether a book list is private (arch §8.5). */
export function bookListQuery(user: User | null, state: BookListState) {
  const queryFn: QueryFunction<PaginatedBookList> = ({ signal }) =>
    fetchBooks(bookListParams(state), signal);
  return state.has_notes
    ? privateQueryOptions(user, bookKeys.list(state), queryFn)
    : queryOptions({ queryKey: bookKeys.list(state), queryFn });
}

export function useBookList(state: BookListState) {
  const { user } = useAuth();
  return useQuery(bookListQuery(user, state));
}

export function useBook(id: number) {
  return useQuery({
    queryKey: bookKeys.detail(id),
    queryFn: ({ signal }) => fetchBook(id, signal),
  });
}
