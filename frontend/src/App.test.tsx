import { focusManager } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { expect, onTestFinished, test, vi } from "vitest";
import type { Session, User } from "./api/auth.ts";
import type { Book, BookDetail } from "./api/books.ts";
import { serveBook, serveBooks } from "./test/catalogApi.ts";
import { serveNotes } from "./test/notesApi.ts";
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

const alice: User = { id: 1, username: "alice" };

function recordPosts(path: string, response: () => Response) {
  const requests: Request[] = [];
  server.use(
    http.post(path, ({ request }) => {
      requests.push(request.clone());
      return response();
    }),
  );
  return requests;
}

function setCsrfCookie(value: string) {
  document.cookie = `csrftoken=${value}; path=/`;
  onTestFinished(() => {
    document.cookie = "csrftoken=; path=/; max-age=0";
  });
}

// Counts catalog requests only: the app also checks the session at startup and
// whenever the tab regains focus.
function spyOnBookRequests() {
  const spy = vi.spyOn(globalThis, "fetch");
  onTestFinished(() => spy.mockRestore());
  return () =>
    spy.mock.calls.filter(
      ([input]) => typeof input === "string" && input.startsWith("/api/books/"),
    );
}

test("an unknown route shows Page not found with a link to the catalog", async () => {
  renderApp("/nope");

  expect(
    await screen.findByRole("heading", { name: "Page not found" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Book Explorer" })).toHaveAttribute(
    "href",
    "/",
  );
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

test("a malformed page shows the same view without calling the API", async () => {
  const bookRequests = spyOnBookRequests();

  renderApp("/?page=abc&utm_source=mail");

  expect(
    await screen.findByRole("heading", { name: "This page doesn't exist" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Go to the first page" }),
  ).toHaveAttribute("href", "/?utm_source=mail");
  expect(bookRequests()).toEqual([]);
});

test("an empty page parameter means page 1", async () => {
  const requests = serveBooks([nineteenEightyFour]);

  renderApp("/?page=");

  expect(
    await screen.findByRole("link", { name: "Nineteen Eighty-Four" }),
  ).toBeInTheDocument();
  expect(requests.map((params) => params.get("page"))).toEqual(["1"]);
});

test("a malformed book id shows Book not found without calling the API", async () => {
  const bookRequests = spyOnBookRequests();

  renderApp("/books/abc");

  expect(
    await screen.findByRole("heading", { name: "Book not found" }),
  ).toBeInTheDocument();
  expect(bookRequests()).toEqual([]);
});

test("Book not found isn't refetched when the tab regains focus", async () => {
  const bookRequests = spyOnBookRequests();
  onTestFinished(() => focusManager.setFocused(undefined));
  server.use(
    http.get("/api/books/999/", () =>
      HttpResponse.json({ detail: "Not found." }, { status: 404 }),
    ),
  );
  renderApp("/books/999");
  await screen.findByRole("heading", { name: "Book not found" });

  // The focus listener refetches after awaiting, so act must wait for it.
  // eslint-disable-next-line @typescript-eslint/require-await
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });

  expect(
    screen.getByRole("heading", { name: "Book not found" }),
  ).toBeInTheDocument();
  expect(bookRequests()).toHaveLength(1);
});

test("the book stays on screen when a refetch on focus fails", async () => {
  onTestFinished(() => focusManager.setFocused(undefined));
  let requests = 0;
  server.use(
    http.get("/api/books/7/", () => {
      requests += 1;
      return requests === 1
        ? HttpResponse.json(nineteenEightyFourDetail)
        : HttpResponse.json({ detail: "Server error." }, { status: 500 });
    }),
  );
  renderApp("/books/7");
  await screen.findByRole("article");

  // eslint-disable-next-line @typescript-eslint/require-await
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
  await waitFor(() => expect(requests).toBe(2));

  // Nothing on screen should change, so give the failure time to show.
  await expect(
    screen.findByRole("alert", undefined, { timeout: 200 }),
  ).rejects.toThrow();
  expect(screen.getByRole("article")).toBeInTheDocument();
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

test("until the session is known, the app shows only its loading state", async () => {
  renderApp("/", { user: alice, holdSession: true });

  expect(await screen.findByRole("status")).toHaveTextContent("Loading…");
  expect(screen.queryByRole("link", { name: "Log in" })).toBeNull();
  expect(screen.queryByText("alice")).toBeNull();
  expect(screen.queryByRole("heading", { name: "Books" })).toBeNull();
});

test("logging in from a book returns to it, with the reader in the header", async () => {
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  onTestFinished(() => scrollTo.mockRestore());
  setCsrfCookie("the-token");
  serveBook(nineteenEightyFourDetail);
  serveNotes(7);
  const logins = recordPosts("/api/auth/login/", () =>
    HttpResponse.json<Session>({ user: alice }),
  );
  renderApp("/books/7");

  // Leave only once the book has loaded. With MSW 3 under Node, a request
  // aborted mid-flight can make the next POST bypass MSW and reach the network.
  await screen.findByRole("heading", {
    level: 1,
    name: "Nineteen Eighty-Four",
  });
  fireEvent.click(screen.getByRole("link", { name: "Log in" }));
  fireEvent.change(await screen.findByLabelText("Username"), {
    target: { value: "alice" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "alice-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Log in" }));

  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "Nineteen Eighty-Four",
    }),
  ).toBeInTheDocument();
  expect(screen.getByText("alice")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  expect(logins.map((request) => request.headers.get("X-CSRFToken"))).toEqual([
    "the-token",
  ]);
  expect(await logins[0].json()).toEqual({
    username: "alice",
    password: "alice-password",
  });
});

test("the login page sends a reader who is already logged in to the catalog", async () => {
  serveBooks([nineteenEightyFour]);

  renderApp("/login", { user: alice });

  expect(
    await screen.findByRole("heading", { name: "Books" }),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText("Username")).toBeNull();
});

test("a 401 shows the reader as logged out without leaving the page", async () => {
  server.use(
    http.get("/api/books/", () =>
      HttpResponse.json(
        { detail: "Authentication credentials were not provided." },
        { status: 401 },
      ),
    ),
  );

  renderApp("/?page=2", { user: alice });

  expect(
    await screen.findByRole("link", { name: "Log in" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("alice")).toBeNull();
  expect(screen.getByRole("heading", { name: "Books" })).toBeInTheDocument();
});

test("logging out sends the CSRF token and shows Log in", async () => {
  setCsrfCookie("the-token");
  serveBooks([nineteenEightyFour]);
  const logouts = recordPosts(
    "/api/auth/logout/",
    () => new HttpResponse(null, { status: 204 }),
  );
  renderApp("/", { user: alice });

  fireEvent.click(await screen.findByRole("button", { name: "Log out" }));

  expect(
    await screen.findByRole("link", { name: "Log in" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("alice")).toBeNull();
  expect(logouts.map((request) => request.headers.get("X-CSRFToken"))).toEqual([
    "the-token",
  ]);
});

test("a failed logout keeps the reader logged in and says so", async () => {
  serveBooks([nineteenEightyFour]);
  recordPosts("/api/auth/logout/", () =>
    HttpResponse.json({ detail: "Server error." }, { status: 500 }),
  );
  renderApp("/", { user: alice });

  fireEvent.click(await screen.findByRole("button", { name: "Log out" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn't log out. Please try again.",
  );
  expect(screen.getByText("alice")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Log out" })).toBeEnabled();
  expect(screen.queryByRole("link", { name: "Log in" })).toBeNull();
});

test("a failed logout's message can be dismissed, and focus moves to Log out", async () => {
  serveBooks([nineteenEightyFour]);
  recordPosts("/api/auth/logout/", () =>
    HttpResponse.json({ detail: "Server error." }, { status: 500 }),
  );
  renderApp("/", { user: alice });

  fireEvent.click(await screen.findByRole("button", { name: "Log out" }));
  fireEvent.click(await screen.findByRole("button", { name: "Dismiss" }));

  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  expect(screen.getByRole("button", { name: "Log out" })).toHaveFocus();
  expect(screen.getByText("alice")).toBeInTheDocument();
});

test("each page is named in the document title", async () => {
  serveBooks([nineteenEightyFour]);
  serveBook(nineteenEightyFourDetail);
  const pages = [
    ["/", "Books — Book Explorer"],
    ["/books/7", "Nineteen Eighty-Four — Book Explorer"],
    ["/books/abc", "Book not found — Book Explorer"],
    ["/login", "Log in — Book Explorer"],
    ["/nope", "Page not found — Book Explorer"],
    ["/?page=abc", "This page doesn't exist — Book Explorer"],
    ["/?sort=banana", "This link contains invalid filters — Book Explorer"],
  ];
  for (const [route, title] of pages) {
    const { unmount } = renderApp(route);

    await waitFor(() => expect(document.title).toBe(title));
    unmount();
  }
});

test("a book that is still loading says so in the document title", async () => {
  server.use(
    http.get("/api/books/7/", async () => {
      await delay("infinite");
      return HttpResponse.json(nineteenEightyFourDetail);
    }),
  );

  renderApp("/books/7");

  await waitFor(() =>
    expect(document.title).toBe("Loading book… — Book Explorer"),
  );
});

test("opening a book moves focus to its title, and Back to books to the list's heading", async () => {
  serveBooks([nineteenEightyFour]);
  serveBook(nineteenEightyFourDetail);
  renderApp("/");
  const link = await screen.findByRole("link", {
    name: "Nineteen Eighty-Four",
  });
  expect(document.body).toHaveFocus();

  fireEvent.click(link);

  const title = await screen.findByRole("heading", {
    level: 1,
    name: "Nineteen Eighty-Four",
  });
  await waitFor(() => expect(title).toHaveFocus());

  fireEvent.click(screen.getByRole("link", { name: "Back to books" }));

  const heading = await screen.findByRole("heading", {
    level: 1,
    name: "Books",
  });
  await waitFor(() => expect(heading).toHaveFocus());
});

test("a filter or page change doesn't move focus to the heading", async () => {
  serveBooks([nineteenEightyFour], 30);
  const { location } = renderApp("/");
  await screen.findByRole("link", { name: "Nineteen Eighty-Four" });
  const heading = screen.getByRole("heading", { level: 1, name: "Books" });

  const direction = screen.getByRole("button", { name: "Ascending" });
  direction.focus();
  fireEvent.click(direction);
  await waitFor(() => expect(location().search).toBe("?sort=-title"));
  await screen.findByRole("link", { name: "Nineteen Eighty-Four" });

  expect(screen.getByRole("button", { name: "Descending" })).toHaveFocus();

  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Page 2 of 3");

  expect(heading).not.toHaveFocus();
});
