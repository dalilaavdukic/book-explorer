import {
  type QueryFunction,
  queryOptions,
  skipToken,
  useQuery,
} from "@tanstack/react-query";
import type { User } from "../api/auth.ts";
import { fetchAuthor, fetchAuthors } from "../api/authors.ts";
import {
  type BookListParams,
  fetchBook,
  fetchBooks,
  type PaginatedBookList,
} from "../api/books.ts";
import { fetchGenres } from "../api/genres.ts";
import { privateQueryOptions, useAuth } from "../auth/session.ts";
import { BOOKS_PAGE_SIZE, type BookListState } from "./listState.ts";

export const bookKeys = {
  list: (state: BookListState) => ["books", "list", state] as const,
  detail: (id: number) => ["books", "detail", id] as const,
};

export const authorKeys = {
  suggestions: (search: string) => ["authors", "suggestions", search] as const,
  detail: (id: number | null) => ["authors", "detail", id] as const,
};

const AUTHOR_SUGGESTIONS = 10;

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
  const params = bookListParams(state);
  const queryFn: QueryFunction<PaginatedBookList> = ({ signal }) =>
    fetchBooks(params, signal);
  return state.has_notes
    ? privateQueryOptions(user, bookKeys.list(state), ({ signal }, reader) =>
        fetchBooks(params, signal, reader),
      )
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

export function useGenres() {
  return useQuery({
    queryKey: ["genres"],
    queryFn: ({ signal }) => fetchGenres(signal),
  });
}

// Each search text has its own entry, so a slow answer for earlier text can't
// replace the suggestions for later text (arch §8.4).
export function useAuthorSuggestions(search: string, enabled: boolean) {
  return useQuery({
    queryKey: authorKeys.suggestions(search),
    queryFn: ({ signal }) =>
      fetchAuthors(
        { search: search || undefined, limit: AUTHOR_SUGGESTIONS },
        signal,
      ),
    enabled,
  });
}

export function useAuthor(id: number | null) {
  return useQuery({
    queryKey: authorKeys.detail(id),
    queryFn: id === null ? skipToken : ({ signal }) => fetchAuthor(id, signal),
    // A name doesn't change while the app is open, and the selector puts the
    // chosen author here so their name shows without a request.
    staleTime: Infinity,
  });
}
