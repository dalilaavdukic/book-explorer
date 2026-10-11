import { fireEvent, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, onTestFinished, test, vi } from "vitest";
import type { Book, BookDetail, PaginatedBookList } from "./api/books.ts";
import { renderApp } from "./test/renderApp.tsx";
import { server } from "./test/server.ts";

const nineteenEightyFour: Book = {
  id: 7,
  title: "Nineteen Eighty-Four",
  author: { id: 1, name: "George Orwell" },
  genre: { id: 2, name: "Dystopian" },
  publication_year: 1949,
};

const nineteenEightyFourDetail: BookDetail = {
  ...nineteenEightyFour,
  description: "A party worker risks everything on a quiet rebellion.",
};

function serveBook(book: BookDetail) {
  server.use(http.get(`/api/books/${book.id}/`, () => HttpResponse.json(book)));
}

function serveBooks(results: Book[], count = results.length) {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get("/api/books/", ({ request }) => {
      requests.push(new URL(request.url).searchParams);
      return HttpResponse.json<PaginatedBookList>({
        count,
        next: null,
        previous: null,
        results,
      });
    }),
  );
  return requests;
}

function spyOnFetch() {
  const spy = vi.spyOn(globalThis, "fetch");
  onTestFinished(() => spy.mockRestore());
  return spy;
}

test("an unknown route shows Page not found with a link to the catalog", () => {
  renderApp("/nope");

  expect(screen.getByRole("link", { name: "Book Explorer" })).toHaveAttribute(
    "href",
    "/",
  );
  expect(
    screen.getByRole("heading", { name: "Page not found" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Back to the catalog" }),
  ).toHaveAttribute("href", "/");
});

test("the list shows each book's title, author, year and genre, linked to its page", async () => {
  const requests = serveBooks([nineteenEightyFour], 25);

  renderApp("/");

  const link = await screen.findByRole("link", {
    name: "Nineteen Eighty-Four",
  });
  expect(link).toHaveAttribute("href", "/books/7");
  const item = screen.getByRole("listitem");
  expect(item).toHaveTextContent("George Orwell · 1949");
  expect(item).toHaveTextContent("Dystopian");
  expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  expect(requests.map(String)).toEqual(["page=1&page_size=12"]);
});

test("a page past the last one shows This page doesn't exist", async () => {
  server.use(
    http.get("/api/books/", () =>
      HttpResponse.json({ detail: "Invalid page." }, { status: 404 }),
    ),
  );

  renderApp("/?page=99");

  expect(
    await screen.findByRole("heading", { name: "This page doesn't exist" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Go to the first page" }),
  ).toHaveAttribute("href", "/");
});

test("a malformed page shows the same view without calling the API", () => {
  const fetchSpy = spyOnFetch();

  renderApp("/?page=abc&utm_source=mail");

  expect(
    screen.getByRole("heading", { name: "This page doesn't exist" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Go to the first page" }),
  ).toHaveAttribute("href", "/?utm_source=mail");
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("an empty page parameter means page 1", async () => {
  const requests = serveBooks([nineteenEightyFour]);

  renderApp("/?page=");

  expect(
    await screen.findByRole("link", { name: "Nineteen Eighty-Four" }),
  ).toBeInTheDocument();
  expect(requests.map((params) => params.get("page"))).toEqual(["1"]);
});

test("a malformed book id shows Book not found without calling the API", () => {
  const fetchSpy = spyOnFetch();

  renderApp("/books/abc");

  expect(
    screen.getByRole("heading", { name: "Book not found" }),
  ).toBeInTheDocument();
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("a book opened directly shows every attribute and links to the first page", async () => {
  serveBook(nineteenEightyFourDetail);

  renderApp("/books/7");

  const article = await screen.findByRole("article");
  expect(
    within(article).getByRole("heading", {
      level: 1,
      name: "Nineteen Eighty-Four",
    }),
  ).toBeInTheDocument();
  for (const text of [
    "by George Orwell",
    "1949",
    "Dystopian",
    nineteenEightyFourDetail.description,
  ]) {
    expect(within(article).getByText(text)).toBeInTheDocument();
  }
  expect(screen.getByRole("link", { name: "Back to books" })).toHaveAttribute(
    "href",
    "/",
  );
});

test("Back to books returns to the list page the book was opened from", async () => {
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  onTestFinished(() => scrollTo.mockRestore());
  serveBooks([nineteenEightyFour], 30);
  serveBook(nineteenEightyFourDetail);
  renderApp("/?page=3");

  fireEvent.click(
    await screen.findByRole("link", { name: "Nineteen Eighty-Four" }),
  );

  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "Nineteen Eighty-Four",
    }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to books" })).toHaveAttribute(
    "href",
    "/?page=3",
  );
  expect(scrollTo).toHaveBeenCalledWith(0, 0);
});
