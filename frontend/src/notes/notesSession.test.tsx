import { focusManager } from "@tanstack/react-query";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, onTestFinished, test, vi } from "vitest";
import type { Session, User } from "../api/auth.ts";
import type { BookDetail } from "../api/books.ts";
import { failNext, holdNext, makeNote, serveNotes } from "../test/notesApi.ts";
import { renderApp } from "../test/renderApp.tsx";
import { server } from "../test/server.ts";

const NOTES_PATH = "/api/books/7/notes/";
const EXPIRED =
  "Your session has expired, and this note isn't saved. Copy anything you want to keep, then log in again.";
const UNAUTHORIZED = {
  detail: "Authentication credentials were not provided.",
};

const alice: User = { id: 1, username: "alice" };
const bob: User = { id: 2, username: "bob" };

const book: BookDetail = {
  id: 7,
  title: "Nineteen Eighty-Four",
  author: { id: 1, name: "George Orwell" },
  genre: { id: 2, name: "Dystopian" },
  publication_year: 1949,
  description: "A party worker risks everything on a quiet rebellion.",
};

const aliceNotes = Array.from({ length: 21 }, (_, index) =>
  makeNote(index + 1, { body: `Alice's note ${index + 1}.` }),
);
const bobNotes = [makeNote(101, { body: "Bob's note." })];

/** Opens the book as alice, with her notes loaded. */
async function openAsAlice() {
  let bookRequests = 0;
  server.use(
    http.get("/api/books/7/", () => {
      bookRequests += 1;
      return HttpResponse.json(book);
    }),
  );
  const api = serveNotes(7, aliceNotes);
  renderApp("/books/7", { user: alice });
  await screen.findByText("Alice's note 21.");
  return { api, bookRequests: () => bookRequests };
}

/** From now on, the server's sessions belong to `user`. */
function serveSession(user: User | null) {
  server.use(
    http.get("/api/auth/session/", () => HttpResponse.json<Session>({ user })),
    http.post("/api/auth/login/", () => HttpResponse.json<Session>({ user })),
  );
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

async function logInAs(user: User, link: string) {
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  onTestFinished(() => scrollTo.mockRestore());
  serveSession(user);
  fireEvent.click(screen.getByRole("link", { name: link }));
  fireEvent.change(await screen.findByLabelText("Username"), {
    target: { value: user.username },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: `${user.username}-password` },
  });
  fireEvent.click(screen.getByRole("button", { name: "Log in" }));
  await screen.findByRole("heading", { level: 1, name: book.title });
}

function form(name: string) {
  return within(screen.getByRole("form", { name }));
}

function typeInForm(name: string, body: string, page?: string) {
  fireEvent.change(form(name).getByLabelText("Note"), {
    target: { value: body },
  });
  if (page !== undefined) {
    fireEvent.change(form(name).getByLabelText("Page (optional)"), {
      target: { value: page },
    });
  }
}

function aliceTextOnScreen() {
  return screen.queryAllByText(/Alice/);
}

test("a save refused with 401 keeps the draft, says the session expired, and logging in again discards it", async () => {
  await openAsAlice();
  failNext("post", NOTES_PATH, 401, UNAUTHORIZED);

  typeInForm("Add a note", "Unsaved thought.", "9");
  fireEvent.click(form("Add a note").getByRole("button", { name: "Add note" }));

  expect(await form("Add a note").findByRole("alert")).toHaveTextContent(
    EXPIRED,
  );
  expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument();
  expect(form("Add a note").getByLabelText("Note")).toHaveValue(
    "Unsaved thought.",
  );
  expect(form("Add a note").getByLabelText("Page (optional)")).toHaveValue("9");
  expect(
    form("Add a note").getByRole("button", { name: "Add note" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("heading", { level: 1, name: book.title }),
  ).toBeInTheDocument();
  expect(aliceTextOnScreen()).toEqual([]);

  await logInAs(alice, "Log in again");

  expect(await screen.findByText("Alice's note 21.")).toBeInTheDocument();
  expect(form("Add a note").getByLabelText("Note")).toHaveValue("");
  expect(screen.queryByText(EXPIRED)).toBeNull();
});

test("a re-check that finds nobody keeps an unsaved edit, and only that", async () => {
  await openAsAlice();
  fireEvent.click(
    within(screen.getByText("Alice's note 21.").closest("li")!).getByRole(
      "button",
      { name: "Edit" },
    ),
  );
  typeInForm("Edit note", "My edited text.");
  serveSession(null);

  await refetchOnFocus();

  // The edit leaves the list, which is gone, so its form is drawn anew.
  expect(await screen.findByRole("alert")).toHaveTextContent(EXPIRED);
  expect(form("Edit note").getByLabelText("Note")).toHaveValue(
    "My edited text.",
  );
  expect(
    form("Edit note").getByRole("button", { name: "Save" }),
  ).toBeDisabled();
  expect(aliceTextOnScreen()).toEqual([]);
  expect(screen.queryByRole("form", { name: "Add a note" })).toBeNull();
  expect(screen.queryByRole("list")).toBeNull();
});

test("after a 401, the next reader never sees the previous reader's notes", async () => {
  const { api } = await openAsAlice();
  failNext("get", NOTES_PATH, 401, UNAUTHORIZED);

  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("link", { name: "Log in to add notes" });
  expect(aliceTextOnScreen()).toEqual([]);
  api.notes.splice(0, api.notes.length, ...bobNotes);
  const bobsNotes = holdNext("get", NOTES_PATH);
  await logInAs(bob, "Log in to add notes");
  await bobsNotes.arrived;

  expect(aliceTextOnScreen()).toEqual([]);
  bobsNotes.release();
  expect(await screen.findByText("Bob's note.")).toBeInTheDocument();
  expect(aliceTextOnScreen()).toEqual([]);
});

test("a late answer for the previous reader never shows", async () => {
  const { api } = await openAsAlice();
  const alicesPage2 = holdNext("get", NOTES_PATH);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await alicesPage2.arrived;
  api.notes.splice(0, api.notes.length, ...bobNotes);
  serveSession(bob);

  await refetchOnFocus();
  alicesPage2.release();

  expect(await screen.findByText("Bob's note.")).toBeInTheDocument();
  expect(aliceTextOnScreen()).toEqual([]);
});

test("a re-check that finds another reader discards the draft", async () => {
  const { api } = await openAsAlice();
  typeInForm("Add a note", "Alice's private draft.");
  api.notes.splice(0, api.notes.length, ...bobNotes);
  serveSession(bob);

  await refetchOnFocus();

  expect(await screen.findByText("Bob's note.")).toBeInTheDocument();
  expect(form("Add a note").getByLabelText("Note")).toHaveValue("");
  expect(screen.queryByDisplayValue(/Alice/)).toBeNull();
  expect(aliceTextOnScreen()).toEqual([]);
});

test("logging out here discards the draft and keeps the book without reloading it", async () => {
  const { bookRequests } = await openAsAlice();
  server.use(
    http.post(
      "/api/auth/logout/",
      () => new HttpResponse(null, { status: 204 }),
    ),
  );
  typeInForm("Add a note", "Alice's private draft.", "4");

  fireEvent.click(screen.getByRole("button", { name: "Log out" }));

  expect(
    await screen.findByRole("link", { name: "Log in to add notes" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("form", { name: "Add a note" })).toBeNull();
  expect(screen.queryByDisplayValue(/Alice/)).toBeNull();
  expect(aliceTextOnScreen()).toEqual([]);
  expect(
    screen.getByRole("heading", { level: 1, name: book.title }),
  ).toBeInTheDocument();
  expect(bookRequests()).toBe(1);
});
