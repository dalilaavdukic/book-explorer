import { useLocation, useSearchParams } from "react-router-dom";
import { parsePositiveInteger } from "./parsePositiveInteger.ts";

export const BOOKS_PAGE_SIZE = 12;

export interface BookListState {
  page: number;
}

// Missing or empty means page 1, as in the API. Anything that isn't a
// canonical positive integer can't be a page, so it's rejected without a request.
function parsePage(value: string | null): number | "invalid" {
  if (value === null || value === "") {
    return 1;
  }
  return parsePositiveInteger(value) ?? "invalid";
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

function toSearch(params: URLSearchParams) {
  const search = params.toString();
  return search ? `?${search}` : "";
}

/** The only place that reads and writes the book list's URL parameters. */
export function useBookListState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { search } = useLocation();
  const page = parsePage(searchParams.get("page"));

  return {
    params: page === "invalid" ? ("invalid" as const) : { page },
    setPage: (next: number) =>
      setSearchParams((current) => withPage(current, next)),
    firstPageSearch: toSearch(withPage(searchParams, 1)),
    listSearch: search,
  };
}
