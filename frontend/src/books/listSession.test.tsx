import { focusManager } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, onTestFinished, test } from "vitest";
import type { Session, User } from "../api/auth.ts";
import type { Book, PaginatedBookList } from "../api/books.ts";
import { makeBook } from "../test/catalogApi.ts";
import { failNext } from "../test/notesApi.ts";
import { renderApp } from "../test/renderApp.tsx";
import { server } from "../test/server.ts";

const UNAUTHORIZED = {
  detail: "Authentication credentials were not provided.",
};

const alice: User = { id: 1, username: "alice" };
const bob: User = { id: 2, username: "bob" };

const publicBooks = [
  makeBook(1, "Public book 1"),
  makeBook(2, "Public book 2"),
];

// Thirteen each, so both readers' lists have a page 2.
const notedBooks: Record<number, Book[]> = {
  [alice.id]: Array.from({ length: 13 }, (_, index) =>
    makeBook(100 + index, `Alice's book ${index + 1}`),
  ),
  [bob.id]: Array.from({ length: 13 }, (_, index) =>
    makeBook(200 + index, `Bob's book ${index + 1}`),
  ),
};

/**
 * The server's session and book lists. A has_notes list holds the books of
 * whoever the session belongs to when the request arrives, as the session
 * cookie decides, whichever reader the app sent it for.
 */
function serveCatalog(reader: User | null) {
  let gate: Promise<void> | undefined;
  let openGate = () => {};
  const api = {
    /** Each book list request's parameters, in order of arrival. */
    requests: [] as string[],
    /** From now on, the session belongs to `user`, and so does a login. */
    serveSession(user: User | null) {
      reader = user;
      server.use(
        http.get("/api/auth/session/", () =>
          HttpResponse.json<Session>({ user }),
        ),
        http.post("/api/auth/login/", () =>
          HttpResponse.json<Session>({ user }),
        ),
      );
    },
    /** Book list requests from now on wait until `release()`. */
    hold() {
      gate = new Promise((resolve) => (openGate = resolve));
    },
    release() {
      openGate();
      gate = undefined;
    },
  };

  server.use(
    http.get("/api/books/", async ({ request }) => {
      const params = new URL(request.url).searchParams;
      const sessionReader = reader;
      api.requests.push(params.toString());
      await gate;
      let books = publicBooks;
      if (params.get("has_notes") === "true") {
        if (sessionReader === null) {
          return HttpResponse.json(UNAUTHORIZED, { status: 401 });
        }
        books = notedBooks[sessionReader.id];
      }
      const page = Number(params.get("page"));
      const size = Number(params.get("page_size"));
      return HttpResponse.json<PaginatedBookList>({
        count: books.length,
        next: null,
        previous: null,
        results: books.slice((page - 1) * size, page * size),
      });
    }),
  );
  return api;
}

async function refetchOnFocus() {
  onTestFinished(() => focusManager.setFocused(undefined));
  // The focus listener refetches after awaiting, so act must wait for it.
  // eslint-disable-next-line @typescript-eslint/require-await
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
}

async function logInFromHeader(user: User) {
  fireEvent.click(screen.getByRole("link", { name: "Log in" }));
  fireEvent.change(await screen.findByLabelText("Username"), {
    target: { value: user.username },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: `${user.username}-password` },
  });
  fireEvent.click(screen.getByRole("button", { name: "Log in" }));
  await screen.findByText(user.username);
}

function aliceTextOnScreen() {
  return screen.queryAllByText(/Alice/);
}

test("after a 401, the public list replaces the reader's, and the next reader sees only theirs", async () => {
  const api = serveCatalog(alice);
  const { location, navigate } = renderApp("/?has_notes=true", {
    user: alice,
  });
  await screen.findByRole("link", { name: "Alice's book 1" });
  failNext("get", "/api/books/", 401, UNAUTHORIZED);

  fireEvent.click(screen.getByRole("button", { name: "Next" }));

  expect(
    await screen.findByRole("link", { name: "Public book 1" }),
  ).toBeInTheDocument();
  // The list uses the cleaned URL at once; the router commits it in a transition.
  await waitFor(() => expect(location().search).toBe(""));
  expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument();
  expect(aliceTextOnScreen()).toEqual([]);

  api.serveSession(bob);
  await logInFromHeader(bob);
  api.hold();
  navigate("/?has_notes=true");
  await waitFor(() =>
    expect(api.requests.at(-1)).toBe("page=1&page_size=12&has_notes=true"),
  );

  expect(screen.getByText("Loading books…")).toBeInTheDocument();
  expect(aliceTextOnScreen()).toEqual([]);
  api.release();
  expect(
    await screen.findByRole("link", { name: "Bob's book 1" }),
  ).toBeInTheDocument();
  expect(aliceTextOnScreen()).toEqual([]);
});

test("a re-check that finds another reader shows only their noted books", async () => {
  const api = serveCatalog(alice);
  renderApp("/?has_notes=true", { user: alice });
  await screen.findByRole("link", { name: "Alice's book 1" });
  api.serveSession(bob);
  api.hold();

  await refetchOnFocus();

  expect(await screen.findByText("bob")).toBeInTheDocument();
  expect(screen.getByText("Loading books…")).toBeInTheDocument();
  expect(aliceTextOnScreen()).toEqual([]);
  api.release();
  expect(
    await screen.findByRole("link", { name: "Bob's book 1" }),
  ).toBeInTheDocument();
  expect(aliceTextOnScreen()).toEqual([]);
});

test("a late answer for the previous reader never shows", async () => {
  const api = serveCatalog(alice);
  renderApp("/?has_notes=true", { user: alice });
  await screen.findByRole("link", { name: "Alice's book 1" });
  api.hold();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() =>
    expect(api.requests).toContain("page=2&page_size=12&has_notes=true"),
  );
  api.serveSession(bob);

  await refetchOnFocus();
  await screen.findByText("bob");
  api.release();

  expect(
    await screen.findByRole("link", { name: "Bob's book 13" }),
  ).toBeInTheDocument();
  expect(aliceTextOnScreen()).toEqual([]);
});

test("logging out on a has_notes list shows the public list at once, and logging back in starts afresh", async () => {
  const api = serveCatalog(alice);
  server.use(
    http.post(
      "/api/auth/logout/",
      () => new HttpResponse(null, { status: 204 }),
    ),
  );
  const { location, navigate } = renderApp("/", { user: alice });
  await screen.findByRole("link", { name: "Public book 1" });
  navigate("/?has_notes=true");
  await screen.findByRole("link", { name: "Alice's book 1" });
  api.hold();

  fireEvent.click(screen.getByRole("button", { name: "Log out" }));

  await waitFor(() =>
    expect(api.requests).toEqual([
      "page=1&page_size=12",
      "page=1&page_size=12&has_notes=true",
      "page=1&page_size=12",
    ]),
  );
  await waitFor(() => expect(location().search).toBe(""));
  expect(
    screen.getByRole("link", { name: "Public book 1" }),
  ).toBeInTheDocument();
  expect(aliceTextOnScreen()).toEqual([]);
  api.release();

  api.serveSession(alice);
  await logInFromHeader(alice);
  api.hold();
  navigate("/?has_notes=true");

  expect(screen.getByText("Loading books…")).toBeInTheDocument();
  expect(aliceTextOnScreen()).toEqual([]);
  api.release();
  expect(
    await screen.findByRole("link", { name: "Alice's book 1" }),
  ).toBeInTheDocument();
});
