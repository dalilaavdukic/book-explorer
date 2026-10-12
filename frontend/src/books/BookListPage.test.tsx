import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test } from "vitest";
import type { User } from "../api/auth.ts";
import type { BookDetail } from "../api/books.ts";
import {
  makeBook,
  serveAuthors,
  serveBook,
  serveBooks,
  serveGenres,
} from "../test/catalogApi.ts";
import { failNext, holdNext } from "../test/notesApi.ts";
import { renderApp } from "../test/renderApp.tsx";

const alice: User = { id: 1, username: "alice" };

const hobbit = makeBook(3, "The Hobbit");
const herbert = { id: 3, name: "Frank Herbert" };

const INVALID_FILTERS = "This link contains invalid filters";

function searchBox() {
  return screen.getByRole("searchbox", { name: "Search" });
}

function typeSearch(...texts: string[]) {
  for (const text of texts) {
    fireEvent.change(searchBox(), { target: { value: text } });
  }
}

function sortBy() {
  return screen.getByRole("combobox", { name: "Sort by" });
}

function filters() {
  return within(screen.getByRole("search", { name: "Find books" }));
}

async function openGenres() {
  fireEvent.click(screen.getByRole("button", { name: /^Genres/ }));
  return within(await screen.findByRole("group", { name: "Genres" }));
}

/** Waits for `ms` of real time, to let the search box's pause end. */
function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Longer than the search box's pause.
const PAUSE = 400;

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
  serveAuthors([]);
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
  serveAuthors([herbert]);
  const { location, navigationType } = renderApp(
    "/?search=zzz&author=3&genre=5&genre=2&sort=-year",
  );

  const empty = await screen.findByText(
    "No books match your search and filters.",
  );
  fireEvent.click(within(empty).getByRole("button", { name: "Clear all" }));

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

  const empty = await screen.findByText(
    "You haven't written notes on any book yet. Open a book to add one.",
  );
  fireEvent.click(within(empty).getByRole("button", { name: "Clear all" }));

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
  await waitFor(() => {
    expect(location().search).toBe("?genre=3");
    expect(navigationType()).toBe("REPLACE");
  });
  expect(requests.map(String)).toEqual(["page=1&page_size=12&genre=3"]);
});

test("typing waits for a pause, then searches once from page 1, replacing the history entry", async () => {
  const requests = serveBooks([hobbit], 30);
  const { location, navigationType } = renderApp("/?page=3");
  await screen.findByRole("link", { name: "The Hobbit" });

  typeSearch("h", "ho", "  hobbit ");

  // Well within the pause: nothing is written yet.
  await wait(100);
  expect(requests.map(String)).toEqual(["page=3&page_size=12"]);
  expect(location().search).toBe("?page=3");
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests.map(String)[1]).toBe("page=1&page_size=12&search=hobbit");
  expect(location().search).toBe("?search=hobbit");
  expect(navigationType()).toBe("REPLACE");
  expect(searchBox()).toHaveValue("  hobbit ");
  await wait(PAUSE);
  expect(requests).toHaveLength(2);
});

test("the search box follows the URL on Back, without writing it again", async () => {
  serveBooks([hobbit]);
  serveGenres();
  const { location, navigate, navigationType } = renderApp("/?search=hobbit");
  await screen.findByRole("link", { name: "The Hobbit" });
  const genrePanel = await openGenres();
  fireEvent.click(genrePanel.getByRole("checkbox", { name: "Fantasy" }));
  await waitFor(() => expect(location().search).toBe("?search=hobbit&genre=5"));
  typeSearch("dune");
  await waitFor(() => expect(location().search).toBe("?search=dune&genre=5"));

  navigate(-1);

  expect(location().search).toBe("?search=hobbit");
  expect(searchBox()).toHaveValue("hobbit");
  expect(
    genrePanel.getByRole("checkbox", { name: "Fantasy" }),
  ).not.toBeChecked();
  await wait(PAUSE);
  expect(location().search).toBe("?search=hobbit");
  expect(navigationType()).toBe("POP");
});

test("a sort chosen during the pause is kept when the search is written", async () => {
  serveBooks([hobbit]);
  const { location } = renderApp("/");
  await screen.findByRole("link", { name: "The Hobbit" });

  typeSearch("dune");
  fireEvent.change(sortBy(), { target: { value: "-year" } });

  await waitFor(() =>
    expect(location().search).toBe("?sort=-year&search=dune"),
  );
  await wait(PAUSE);
  expect(location().search).toBe("?sort=-year&search=dune");
});

test("each genre chosen adds a history entry, in id order, from page 1", async () => {
  const requests = serveBooks([hobbit], 30);
  serveGenres();
  const { location, navigate, navigationType } = renderApp("/?page=2");
  await screen.findByRole("link", { name: "The Hobbit" });
  const genrePanel = await openGenres();

  fireEvent.click(genrePanel.getByRole("checkbox", { name: "Fantasy" }));
  await waitFor(() => expect(location().search).toBe("?genre=5"));
  expect(navigationType()).toBe("PUSH");
  fireEvent.click(genrePanel.getByRole("checkbox", { name: "Dystopian" }));
  await waitFor(() => expect(location().search).toBe("?genre=2&genre=5"));

  expect(navigationType()).toBe("PUSH");
  expect(
    screen.getByRole("button", { name: "Genres (2)" }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(requests.map(String).at(-1)).toBe(
      "page=1&page_size=12&genre=2&genre=5",
    ),
  );
  navigate(-1);
  expect(location().search).toBe("?genre=5");
  navigate(-1);
  expect(location().search).toBe("?page=2");
});

test("genres in a link are read once each, and Back restores an unchecked one", async () => {
  const requests = serveBooks([hobbit]);
  serveGenres();
  const { location, navigate } = renderApp("/?genre=5&genre=2&genre=5");
  await screen.findByRole("link", { name: "The Hobbit" });
  expect(requests.map(String)).toEqual(["page=1&page_size=12&genre=2&genre=5"]);
  const genrePanel = await openGenres();
  expect(genrePanel.getByRole("checkbox", { name: "Dystopian" })).toBeChecked();
  expect(genrePanel.getByRole("checkbox", { name: "Fantasy" })).toBeChecked();

  fireEvent.click(genrePanel.getByRole("checkbox", { name: "Fantasy" }));
  await waitFor(() => expect(location().search).toBe("?genre=2"));
  navigate(-1);

  expect(location().search).toBe("?genre=5&genre=2&genre=5");
  expect(genrePanel.getByRole("checkbox", { name: "Dystopian" })).toBeChecked();
  expect(genrePanel.getByRole("checkbox", { name: "Fantasy" })).toBeChecked();
});

test("a genre list that fails to load can be retried, and Escape closes it", async () => {
  serveBooks([hobbit]);
  serveGenres();
  failNext("get", "/api/genres/", 500);
  renderApp("/");
  await screen.findByRole("link", { name: "The Hobbit" });

  fireEvent.click(screen.getByRole("button", { name: "Genres" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Genres couldn't be loaded.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  const fantasy = await screen.findByRole("checkbox", { name: "Fantasy" });
  fireEvent.keyDown(fantasy, { key: "Escape" });
  expect(screen.queryByRole("group", { name: "Genres" })).toBeNull();
  expect(screen.getByRole("button", { name: "Genres" })).toHaveFocus();
  expect(screen.getByRole("button", { name: "Genres" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("choosing a sort goes to page 1, and the default sort leaves the URL", async () => {
  const requests = serveBooks([hobbit], 30);
  const { location, navigationType } = renderApp("/?page=2");
  await screen.findByRole("link", { name: "The Hobbit" });

  fireEvent.change(sortBy(), { target: { value: "-year" } });
  await waitFor(() => expect(location().search).toBe("?sort=-year"));
  expect(navigationType()).toBe("PUSH");
  expect(sortBy()).toHaveDisplayValue("Year, newest first");
  fireEvent.change(sortBy(), { target: { value: "title" } });
  await waitFor(() => expect(location().search).toBe(""));

  await waitFor(() =>
    expect(requests.map(String)).toEqual([
      "page=2&page_size=12",
      "page=1&page_size=12&sort=-year",
      "page=1&page_size=12",
    ]),
  );
});

test("visitors don't see Books with my notes", async () => {
  serveBooks([hobbit]);
  renderApp("/");
  await screen.findByRole("link", { name: "The Hobbit" });
  expect(
    screen.queryByRole("checkbox", { name: "Books with my notes" }),
  ).toBeNull();
});

test("a reader turning on Books with my notes lists their noted books from page 1", async () => {
  const requests = serveBooks([hobbit], 30);
  const { location } = renderApp("/?page=2", { user: alice });
  await screen.findByRole("link", { name: "The Hobbit" });

  fireEvent.click(
    screen.getByRole("checkbox", { name: "Books with my notes" }),
  );

  await waitFor(() => expect(location().search).toBe("?has_notes=true"));
  expect(
    screen.getByRole("checkbox", { name: "Books with my notes" }),
  ).toBeChecked();
  await waitFor(() =>
    expect(requests.map(String).at(-1)).toBe(
      "page=1&page_size=12&has_notes=true",
    ),
  );
});

test("Clear all keeps only the sort and empties the search box", async () => {
  serveBooks([hobbit]);
  serveAuthors([herbert]);
  const { location } = renderApp(
    "/?search=hobbit&author=3&genre=2&has_notes=true&sort=-year&page=2",
    { user: alice },
  );
  await screen.findByRole("link", { name: "The Hobbit" });
  const author = screen.getByRole("combobox", { name: "Author" });
  await waitFor(() => expect(author).toHaveValue("Frank Herbert"));
  expect(searchBox()).toHaveValue("hobbit");

  fireEvent.click(filters().getByRole("button", { name: "Clear all" }));

  await waitFor(() => expect(location().search).toBe("?sort=-year"));
  expect(searchBox()).toHaveValue("");
  expect(author).toHaveValue("");
  expect(filters().queryByRole("button", { name: "Clear all" })).toBeNull();
});

test("Clear all during the pause drops the text being typed", async () => {
  const requests = serveBooks([hobbit]);
  const { location } = renderApp("/?genre=2&sort=-year");
  await screen.findByRole("link", { name: "The Hobbit" });

  typeSearch("dune");
  fireEvent.click(filters().getByRole("button", { name: "Clear all" }));

  await waitFor(() => expect(location().search).toBe("?sort=-year"));
  expect(searchBox()).toHaveValue("");
  await wait(PAUSE);
  expect(location().search).toBe("?sort=-year");
  expect(requests.filter((params) => params.has("search"))).toEqual([]);
});

test("going back from a book restores the controls and the results at once", async () => {
  const hobbitDetail: BookDetail = {
    ...hobbit,
    description: "A hobbit is swept into a quest for a dragon's gold.",
  };
  serveBooks([hobbit], 30);
  serveBook(hobbitDetail);
  serveGenres();
  const { navigate } = renderApp("/?search=hobbit&genre=2&sort=-year&page=2");
  fireEvent.click(await screen.findByRole("link", { name: "The Hobbit" }));
  await screen.findByRole("article");
  const refetch = holdNext("get", "/api/books/");

  navigate(-1);

  expect(screen.getByRole("link", { name: "The Hobbit" })).toBeInTheDocument();
  expect(searchBox()).toHaveValue("hobbit");
  expect(
    screen.getByRole("button", { name: "Genres (1)" }),
  ).toBeInTheDocument();
  expect(sortBy()).toHaveValue("-year");
  expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  await refetch.arrived;
  expect(screen.getByRole("link", { name: "The Hobbit" })).toBeInTheDocument();
  refetch.release();
});
