import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, onTestFinished, test, vi } from "vitest";
import type { Book, PaginatedBookList } from "./api/books.ts";
import { renderApp } from "./test/renderApp.tsx";
import { server } from "./test/server.ts";

const nineteenEightyFour: Book = {
  id: 7,
  title: "Nineteen Eighty-Four",
  author: { id: 1, name: "George Orwell" },
  genre: { id: 2, name: "Dystopian" },
  publication_year: 1949,
};

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
