import { useEffect } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import type { BookListParams } from "../api/books.ts";
import { useAuth } from "../auth/session.ts";
import { parsePositiveInteger } from "./parsePositiveInteger.ts";

export const BOOKS_PAGE_SIZE = 12;

export type BookSort = NonNullable<BookListParams["sort"]>;
export type BookSortField = Exclude<BookSort, `-${string}`>;

// A Record must name every generated sort field, so the options and the URL
// check can't drift from the API.
export const BOOK_SORT_FIELDS: Record<BookSortField, string> = {
  title: "Title",
  author: "Author",
  year: "Year",
};

/** The list's URL parameters, with the API's names and values. */
export interface BookListState {
  page: number;
  /** Trimmed, and "" for no search. */
  search: string;
  author: number | null;
  /** Ascending, without duplicates. */
  genre: number[];
  has_notes: boolean;
  sort: BookSort;
}

/**
 * Why a URL can't be shown. Bad filters are reported before a bad page, as the
 * API checks them first.
 */
export type InvalidBookList = "invalid-page" | "invalid-filters";

export interface BookListUrl {
  params: BookListState | InvalidBookList;
  setPage: (page: number) => void;
  /** Replaces the history entry, so Back doesn't step through each pause. */
  setSearch: (search: string) => void;
  setAuthor: (author: number | null) => void;
  setGenres: (genres: number[]) => void;
  setSort: (sort: BookSort) => void;
  setHasNotes: (hasNotes: boolean) => void;
  /** Removes the search and every filter, and keeps the sort. */
  clearAll: () => void;
  /** The current search string on page 1, for "Go to the first page". */
  firstPageSearch: string;
  /** The current search string, for "Back to books". */
  listSearch: string;
}

const FILTERS = ["search", "author", "genre", "has_notes"];

function withoutDirection(value: string) {
  return value.startsWith("-") ? value.slice(1) : value;
}

function isBookSort(value: string): value is BookSort {
  return Object.hasOwn(BOOK_SORT_FIELDS, withoutDirection(value));
}

/** The field and direction of a sort, which the toolbar sets separately. */
export function splitSort(sort: BookSort) {
  return {
    // A sort is a field, with a leading "-" when it's descending.
    field: withoutDirection(sort) as BookSortField,
    descending: sort.startsWith("-"),
  };
}

// Only compiles while the API has a descending sort for every field.
export function joinSort(field: BookSortField, descending: boolean): BookSort {
  return descending ? `-${field}` : field;
}

function parseOptionalInteger(value: string | null): number | null | "invalid" {
  if (value === null || value === "") {
    return null;
  }
  return parsePositiveInteger(value) ?? "invalid";
}

function parseGenres(values: string[]): number[] | "invalid" {
  const genres = new Set<number>();
  for (const value of values) {
    const genre = parseOptionalInteger(value);
    if (genre === "invalid") {
      return "invalid";
    }
    if (genre !== null) {
      genres.add(genre);
    }
  }
  return [...genres].sort((a, b) => a - b);
}

function parseHasNotes(value: string | null): boolean | "invalid" {
  if (value === null || value === "" || value === "false") {
    return false;
  }
  return value === "true" ? true : "invalid";
}

function parseSort(value: string | null): BookSort | "invalid" {
  if (value === null || value === "") {
    return "title";
  }
  return isBookSort(value) ? value : "invalid";
}

/**
 * Reads the list's parameters. Missing and empty values mean the default, and
 * unknown names are ignored. A value that can't be valid is rejected without a
 * request, showing the view the API's error would.
 */
export function readBookListState(
  params: URLSearchParams,
): BookListState | InvalidBookList {
  const author = parseOptionalInteger(params.get("author"));
  const genre = parseGenres(params.getAll("genre"));
  const hasNotes = parseHasNotes(params.get("has_notes"));
  const sort = parseSort(params.get("sort"));
  if (
    author === "invalid" ||
    genre === "invalid" ||
    hasNotes === "invalid" ||
    sort === "invalid"
  ) {
    return "invalid-filters";
  }

  const page = parseOptionalInteger(params.get("page")) ?? 1;
  if (page === "invalid") {
    return "invalid-page";
  }
  return {
    page,
    search: params.get("search")?.trim() ?? "",
    author,
    genre,
    has_notes: hasNotes,
    sort,
  };
}

// The page number belonged to the personalized list, so it goes too.
function withoutHasNotes(params: URLSearchParams) {
  const next = new URLSearchParams(params);
  next.delete("has_notes");
  next.delete("page");
  return next;
}

function withPage(params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params);
  if (page === 1) {
    next.delete("page");
  } else {
    next.set("page", String(page));
  }
  return next;
}

function setOrDelete(params: URLSearchParams, name: string, value: string) {
  if (value === "") {
    params.delete(name);
  } else {
    params.set(name, value);
  }
}

function toSearch(params: URLSearchParams) {
  const search = params.toString();
  return search ? `?${search}` : "";
}

/** The only place that reads and writes the book list's URL parameters. */
export function useBookListState(): BookListUrl {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { search } = useLocation();

  // Visitors can't have personalized results (AC-S3). This covers a shared
  // link, a logout, a 401 and a re-check that finds nobody alike.
  const visitorHasNotes = user === null && searchParams.has("has_notes");
  const params = visitorHasNotes ? withoutHasNotes(searchParams) : searchParams;

  useEffect(() => {
    if (visitorHasNotes) {
      setSearchParams(withoutHasNotes, { replace: true });
    }
  }, [visitorHasNotes, setSearchParams]);

  // Every change but the page's starts again from page 1 (AC-S6).
  const change = (
    edit: (next: URLSearchParams) => void,
    { replace = false } = {},
  ) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        edit(next);
        next.delete("page");
        return next;
      },
      { replace },
    );

  return {
    params: readBookListState(params),
    setPage: (page) => setSearchParams((current) => withPage(current, page)),
    setSearch: (text) =>
      change((next) => setOrDelete(next, "search", text.trim()), {
        replace: true,
      }),
    setAuthor: (author) =>
      change((next) => setOrDelete(next, "author", String(author ?? ""))),
    setGenres: (genres) =>
      change((next) => {
        next.delete("genre");
        for (const genre of [...new Set(genres)].sort((a, b) => a - b)) {
          next.append("genre", String(genre));
        }
      }),
    setSort: (sort) =>
      change((next) => setOrDelete(next, "sort", sort === "title" ? "" : sort)),
    setHasNotes: (hasNotes) =>
      change((next) => setOrDelete(next, "has_notes", hasNotes ? "true" : "")),
    clearAll: () =>
      change((next) => {
        for (const name of FILTERS) {
          next.delete(name);
        }
      }),
    firstPageSearch: toSearch(withPage(params, 1)),
    listSearch: search,
  };
}
