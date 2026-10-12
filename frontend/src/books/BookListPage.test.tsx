import { fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import type { User } from "../api/auth.ts";
import { makeBook, serveBooks } from "../test/catalogApi.ts";
import { failNext } from "../test/notesApi.ts";
import { renderApp } from "../test/renderApp.tsx";

const alice: User = { id: 1, username: "alice" };

const hobbit = makeBook(3, "The Hobbit");

const INVALID_FILTERS = "This link contains invalid filters";

test("a malformed filter in the link shows invalid filters without a request", async () => {
  const requests = serveBooks([hobbit]);

  renderApp("/?genre=abc&sort=-year");

  expect(
    await screen.findByRole("heading", { name: INVALID_FILTERS }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Books" })).toBeNull();
  expect(requests).toEqual([]);
});

test("a filter the API rejects shows the same view, whose Clear all starts over", async () => {
  const requests = serveBooks([hobbit]);
  failNext("get", "/api/books/", 400, {
    author: [
      "Select a valid choice. That choice is not one of the available choices.",
    ],
  });
  const { location } = renderApp("/?author=999&sort=-year");

  fireEvent.click(await screen.findByRole("link", { name: "Clear all" }));

  expect(
    await screen.findByRole("link", { name: "The Hobbit" }),
  ).toBeInTheDocument();
  expect(location().search).toBe("");
  expect(requests.map(String)).toEqual(["page=1&page_size=12"]);
});

test("no match shows the empty state, and Clear all keeps only the sort", async () => {
  const requests = serveBooks((params) =>
    params.has("search") ? [] : [hobbit],
  );
  const { location, navigationType } = renderApp(
    "/?search=zzz&author=3&genre=5&genre=2&sort=-year",
  );

  expect(
    await screen.findByText("No books match your search and filters."),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

  expect(
    await screen.findByRole("link", { name: "The Hobbit" }),
  ).toBeInTheDocument();
  expect(location().search).toBe("?sort=-year");
  expect(navigationType()).toBe("PUSH");
  expect(requests.map(String)).toEqual([
    "page=1&page_size=12&search=zzz&author=3&genre=2&genre=5&sort=-year",
    "page=1&page_size=12&sort=-year",
  ]);
});

test("a reader with no notes who lists only noted books is told how to add one", async () => {
  const requests = serveBooks((params) =>
    params.has("has_notes") ? [] : [hobbit],
  );
  const { location } = renderApp("/?has_notes=true", { user: alice });

  expect(
    await screen.findByText(
      "You haven't written notes on any book yet. Open a book to add one.",
    ),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

  expect(
    await screen.findByRole("link", { name: "The Hobbit" }),
  ).toBeInTheDocument();
  expect(location().search).toBe("");
  expect(requests.map(String)).toEqual([
    "page=1&page_size=12&has_notes=true",
    "page=1&page_size=12",
  ]);
});

test("a visitor's has_notes link loses it and its page, and lists the public catalog", async () => {
  const requests = serveBooks([hobbit]);

  const { location, navigationType } = renderApp(
    "/?has_notes=true&page=2&genre=3",
  );

  expect(
    await screen.findByRole("link", { name: "The Hobbit" }),
  ).toBeInTheDocument();
  expect(location().search).toBe("?genre=3");
  expect(navigationType()).toBe("REPLACE");
  expect(requests.map(String)).toEqual(["page=1&page_size=12&genre=3"]);
});
