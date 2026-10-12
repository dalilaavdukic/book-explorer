import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test } from "vitest";
import type { Author } from "../api/authors.ts";
import {
  makeBook,
  serveAuthors,
  serveAuthorSuggestions,
  serveBooks,
} from "../test/catalogApi.ts";
import { failNext, holdNext } from "../test/notesApi.ts";
import { renderApp } from "../test/renderApp.tsx";

const hobbit = makeBook(3, "The Hobbit");

const tolkien: Author = { id: 42, name: "J. R. R. Tolkien" };
const tolle: Author = { id: 43, name: "Eckhart Tolle" };
const tolstoy: Author = { id: 44, name: "Leo Tolstoy" };
// By surname, as the server lists them, which isn't the order of the names.
const tolAuthors = [tolkien, tolle, tolstoy];

function authorInput() {
  return screen.getByRole("combobox", { name: "Author" });
}

function typeAuthor(...texts: string[]) {
  for (const text of texts) {
    fireEvent.change(authorInput(), { target: { value: text } });
  }
}

function press(key: string) {
  fireEvent.keyDown(authorInput(), { key });
}

function suggestions() {
  return within(screen.getByRole("listbox", { name: "Authors" }));
}

function optionNames() {
  const list = screen.queryByRole("listbox", { name: "Authors" });
  return list === null
    ? []
    : within(list)
        .getAllByRole("option")
        .map((option) => option.textContent);
}

/** Waits for `ms` of real time. */
function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function renderList(route = "/") {
  const app = renderApp(route);
  await screen.findByRole("link", { name: "The Hobbit" });
  return app;
}

test("suggestions wait for a pause, then come in one request, in the server's order", async () => {
  serveBooks([hobbit]);
  const requests = serveAuthorSuggestions(tolAuthors);
  await renderList();
  const held = holdNext("get", "/api/authors/");
  let arrived = false;
  void held.arrived.then(() => (arrived = true));

  typeAuthor("t", "to", "tol");

  // Well within the pause: nothing is requested yet.
  await wait(100);
  expect(arrived).toBe(false);
  expect(screen.getByRole("status")).toHaveTextContent("Searching authors…");
  await held.arrived;
  expect(screen.getByRole("status")).toHaveTextContent("Searching authors…");
  held.release();
  await screen.findByRole("listbox", { name: "Authors" });
  expect(optionNames()).toEqual([
    "J. R. R. Tolkien",
    "Eckhart Tolle",
    "Leo Tolstoy",
  ]);
  expect(requests).toEqual(["search=tol&limit=10"]);
});

test("no match and a failure each say so", async () => {
  serveBooks([hobbit]);
  serveAuthorSuggestions([]);
  await renderList();

  typeAuthor("zzz");
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("No authors match."),
  );
  failNext("get", "/api/authors/", 500);
  typeAuthor("zzzz");

  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "Authors couldn't be loaded.",
    ),
  );
  expect(optionNames()).toEqual([]);
});

test("a message shown again on reopening goes into the same live region", async () => {
  serveBooks([hobbit]);
  serveAuthorSuggestions([]);
  await renderList();
  const status = screen.getByRole("status");
  expect(status).toBeEmptyDOMElement();

  typeAuthor("zzz");
  await waitFor(() => expect(status).toHaveTextContent("No authors match."));
  expect(authorInput()).toHaveAttribute("aria-expanded", "false");
  press("Escape");
  expect(status).toBeEmptyDOMElement();
  press("ArrowDown");

  expect(screen.getByRole("status")).toBe(status);
  expect(status).toHaveTextContent("No authors match.");
  expect(authorInput()).toHaveAttribute("aria-expanded", "false");
});

test("the arrow keys and Enter choose an author, as a new history entry from page 1", async () => {
  const bookRequests = serveBooks([hobbit], 30);
  serveAuthorSuggestions(tolAuthors);
  const detailRequests = serveAuthors([]);
  const { location, navigate, navigationType } = await renderList("/?page=2");
  typeAuthor("tol");
  await screen.findByRole("listbox", { name: "Authors" });

  press("ArrowDown");
  press("ArrowDown");
  expect(authorInput()).toHaveAttribute(
    "aria-activedescendant",
    suggestions().getByRole("option", { name: "Eckhart Tolle" }).id,
  );
  press("Enter");

  await waitFor(() => expect(location().search).toBe("?author=43"));
  expect(navigationType()).toBe("PUSH");
  expect(authorInput()).toHaveValue("Eckhart Tolle");
  expect(authorInput()).toHaveAttribute("aria-expanded", "false");
  await waitFor(() =>
    expect(bookRequests.map(String).at(-1)).toBe(
      "page=1&page_size=12&author=43",
    ),
  );
  expect(detailRequests).toEqual([]);

  navigate(-1);

  expect(location().search).toBe("?page=2");
  expect(authorInput()).toHaveValue("");
});

test("the arrow keys wrap around, and Escape closes the list, then restores the name", async () => {
  serveBooks([hobbit]);
  serveAuthorSuggestions(tolAuthors);
  serveAuthors([tolkien]);
  await renderList("/?author=42");
  await waitFor(() => expect(authorInput()).toHaveValue("J. R. R. Tolkien"));
  typeAuthor("tol");
  await screen.findByRole("listbox", { name: "Authors" });
  expect(authorInput()).toHaveAttribute("aria-expanded", "true");

  press("ArrowUp");
  expect(
    suggestions().getByRole("option", { name: "Leo Tolstoy" }),
  ).toHaveAttribute("aria-selected", "true");
  press("ArrowDown");
  expect(
    suggestions().getByRole("option", { name: "J. R. R. Tolkien" }),
  ).toHaveAttribute("aria-selected", "true");
  press("Escape");

  expect(authorInput()).toHaveAttribute("aria-expanded", "false");
  expect(optionNames()).toEqual([]);
  expect(authorInput()).toHaveValue("tol");
  press("Escape");
  expect(authorInput()).toHaveValue("J. R. R. Tolkien");
});

test("leaving the field restores the chosen author's name", async () => {
  serveBooks([hobbit]);
  serveAuthorSuggestions(tolAuthors);
  serveAuthors([tolkien]);
  const { location } = await renderList("/?author=42");
  await waitFor(() => expect(authorInput()).toHaveValue("J. R. R. Tolkien"));
  typeAuthor("tol");
  await screen.findByRole("listbox", { name: "Authors" });

  fireEvent.blur(authorInput());

  expect(authorInput()).toHaveValue("J. R. R. Tolkien");
  expect(authorInput()).toHaveAttribute("aria-expanded", "false");
  expect(location().search).toBe("?author=42");
});

test("Clear removes the author from the URL and empties the field", async () => {
  serveBooks([hobbit], 30);
  serveAuthors([tolkien]);
  const { location } = await renderList("/?author=42&page=2");
  await waitFor(() => expect(authorInput()).toHaveValue("J. R. R. Tolkien"));

  fireEvent.click(screen.getByRole("button", { name: "Clear author" }));

  await waitFor(() => expect(location().search).toBe(""));
  expect(authorInput()).toHaveValue("");
  expect(screen.queryByRole("button", { name: "Clear author" })).toBeNull();
});

test("an author in the link shows their name, without asking for suggestions", async () => {
  serveBooks([hobbit]);
  const suggestionRequests = serveAuthorSuggestions(tolAuthors);
  const detailRequests = serveAuthors([tolkien]);

  await renderList("/?author=42");

  await waitFor(() => expect(authorInput()).toHaveValue("J. R. R. Tolkien"));
  expect(detailRequests).toEqual([42]);
  expect(suggestionRequests).toEqual([]);
});
