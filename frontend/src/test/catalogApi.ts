import { http, HttpResponse } from "msw";
import type { Book, BookDetail, PaginatedBookList } from "../api/books.ts";
import { server } from "./server.ts";

/** A book with its own id and title, and everything else shared. */
export function makeBook(id: number, title: string): Book {
  return {
    id,
    title,
    author: { id: 1, name: "George Orwell" },
    genre: { id: 2, name: "Dystopian" },
    publication_year: 1949,
  };
}

export function serveBook(book: BookDetail) {
  server.use(http.get(`/api/books/${book.id}/`, () => HttpResponse.json(book)));
}

/**
 * Answers every book list request with `results`, or with the books `results`
 * picks for that request's parameters, out of `count` books in all (by default,
 * as many as there are results). Returns each request's parameters, in order.
 */
export function serveBooks(
  results: Book[] | ((params: URLSearchParams) => Book[]),
  count?: number,
) {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get("/api/books/", ({ request }) => {
      const params = new URL(request.url).searchParams;
      requests.push(params);
      const books = typeof results === "function" ? results(params) : results;
      return HttpResponse.json<PaginatedBookList>({
        count: count ?? books.length,
        next: null,
        previous: null,
        results: books,
      });
    }),
  );
  return requests;
}
