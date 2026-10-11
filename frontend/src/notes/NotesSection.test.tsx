import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, onTestFinished, test, vi } from "vitest";
import type { Session, User } from "../api/auth.ts";
import type { BookDetail } from "../api/books.ts";
import {
  failNext,
  holdNext,
  makeNote,
  makeNotes,
  serveNotes,
} from "../test/notesApi.ts";
import { renderApp } from "../test/renderApp.tsx";
import { server } from "../test/server.ts";

const NOTES_PATH = "/api/books/7/notes/";

const alice: User = { id: 1, username: "alice" };

const book: BookDetail = {
  id: 7,
  title: "Nineteen Eighty-Four",
  author: { id: 1, name: "George Orwell" },
  genre: { id: 2, name: "Dystopian" },
  publication_year: 1949,
  description: "A party worker risks everything on a quiet rebellion.",
};

function serveBook() {
  server.use(http.get("/api/books/7/", () => HttpResponse.json(book)));
}

/** Opens the book as alice, with her notes, once the notes have loaded. */
async function openAsAlice(notes: Parameters<typeof serveNotes>[1] = []) {
  serveBook();
  const api = serveNotes(7, notes);
  renderApp("/books/7", { user: alice });
  await screen.findByRole("heading", { name: "Your notes" });
  await waitFor(() =>
    expect(screen.queryByText("Loading notes…")).not.toBeInTheDocument(),
  );
  return api;
}

function createForm() {
  return within(screen.getByRole("form", { name: "Add a note" }));
}

function typeNote(body: string, page = "") {
  fireEvent.change(createForm().getByLabelText("Note"), {
    target: { value: body },
  });
  fireEvent.change(createForm().getByLabelText("Page (optional)"), {
    target: { value: page },
  });
}

function addNoteButton() {
  return createForm().getByRole("button", { name: "Add note" });
}

function noteItems() {
  return within(screen.getByRole("list")).getAllByRole("listitem");
}

async function goToPage(page: number) {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText(`Page ${page} of 2`);
  await waitFor(() =>
    expect(screen.queryByText("Loading notes…")).not.toBeInTheDocument(),
  );
}

test("a visitor sees a login link, and logging in returns to the book with their notes", async () => {
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  onTestFinished(() => scrollTo.mockRestore());
  serveBook();
  const api = serveNotes(7, [makeNote(1, { body: "Alice's note." })]);
  server.use(
    http.post("/api/auth/login/", () =>
      HttpResponse.json<Session>({ user: alice }),
    ),
  );
  renderApp("/books/7");

  fireEvent.click(
    await screen.findByRole("link", { name: "Log in to add notes" }),
  );
  expect(api.gets).toEqual([]);
  fireEvent.change(await screen.findByLabelText("Username"), {
    target: { value: "alice" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "alice-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Log in" }));

  expect(await screen.findByText("Alice's note.")).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { level: 1, name: "Nineteen Eighty-Four" }),
  ).toBeInTheDocument();
});

test("a reader's notes show newest first, with page and times, as plain text", async () => {
  const api = await openAsAlice([
    makeNote(1, { body: "Older.", page: 12 }),
    makeNote(2, {
      body: "Newer.",
      edited_at: "2026-10-02T10:00:00Z",
    }),
    makeNote(3, { body: "<b>bold</b>" }),
    makeNote(4, { body: "First line.\nSecond line." }),
  ]);

  expect(api.gets).toEqual(["page=1&page_size=20"]);
  const items = noteItems();
  expect(items.map((item) => item.querySelector("p")?.textContent)).toEqual([
    "First line.\nSecond line.",
    "<b>bold</b>",
    "Newer.",
    "Older.",
  ]);
  expect(items[1].querySelector("b")).toBeNull();
  expect(items[2]).toHaveTextContent(/Edited/);
  expect(items[3]).toHaveTextContent("p. 12");
  expect(items[3]).not.toHaveTextContent(/Edited/);
  expect(items[3].querySelector("time")).toHaveAttribute(
    "datetime",
    makeNote(1).created_at,
  );
});

test("adding a note sends its body and page, clears the form and shows it first", async () => {
  const api = await openAsAlice([makeNote(1, { body: "Older." })]);

  typeNote("A new thought.", "42");
  fireEvent.click(addNoteButton());

  await waitFor(() =>
    expect(createForm().getByLabelText("Note")).toHaveValue(""),
  );
  expect(createForm().getByLabelText("Page (optional)")).toHaveValue("");
  expect(api.posts).toEqual([{ body: "A new thought.", page: 42 }]);
  expect(noteItems()[0]).toHaveTextContent("A new thought.");
  expect(noteItems()[0]).toHaveTextContent("p. 42");
});

test("a note added from page 2 shows on page 1, the only page fetched", async () => {
  const api = await openAsAlice(makeNotes(21));
  await goToPage(2);
  const getsBefore = api.gets.length;

  typeNote("A new thought.");
  fireEvent.click(addNoteButton());
  await waitFor(() =>
    expect(createForm().getByLabelText("Note")).toHaveValue(""),
  );

  expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
  expect(noteItems()[0]).toHaveTextContent("A new thought.");
  const getsAfter = api.gets.slice(getsBefore);
  expect(getsAfter).toContain("page=1&page_size=20");
  expect(getsAfter).not.toContain("page=2&page_size=20");
});

test("Add note stays disabled for a blank note", async () => {
  await openAsAlice();

  expect(addNoteButton()).toBeDisabled();
  typeNote(" \n\t ");
  expect(addNoteButton()).toBeDisabled();
});

test.each(["0", "1.5", "abc", "10001"])(
  "a page of %s shows the page error and sends nothing",
  async (page) => {
    const api = await openAsAlice();

    typeNote("A note.", page);
    fireEvent.click(addNoteButton());

    expect(
      createForm().getByLabelText("Page (optional)"),
    ).toHaveAccessibleDescription("Enter a whole number from 1 to 10,000.");
    expect(api.posts).toEqual([]);
  },
);

test("a rejected page shows the server's message under the field and keeps the draft", async () => {
  await openAsAlice();
  failNext("post", NOTES_PATH, 400, {
    page: ["Ensure this value is less than or equal to 10000."],
  });

  typeNote("A note.", "12");
  fireEvent.click(addNoteButton());

  await waitFor(() =>
    expect(
      createForm().getByLabelText("Page (optional)"),
    ).toHaveAccessibleDescription(
      "Ensure this value is less than or equal to 10000.",
    ),
  );
  expect(createForm().getByLabelText("Note")).toHaveValue("A note.");
  expect(createForm().getByLabelText("Page (optional)")).toHaveValue("12");
});

test("a second click while saving sends nothing", async () => {
  const api = await openAsAlice();
  const post = holdNext("post", NOTES_PATH);

  typeNote("Only once.");
  fireEvent.click(addNoteButton());
  await post.arrived;
  // TanStack Query reports the pending state a tick after the click, before
  // a real double click's second click arrives.
  await waitFor(() => expect(addNoteButton()).toBeDisabled());
  fireEvent.click(addNoteButton());
  post.release();

  await waitFor(() =>
    expect(createForm().getByLabelText("Note")).toHaveValue(""),
  );
  expect(api.posts).toHaveLength(1);
  expect(noteItems()).toHaveLength(1);
});

test("a failed save says so and keeps the draft", async () => {
  const api = await openAsAlice();
  failNext("post", NOTES_PATH, 500);

  typeNote("Don't lose me.", "3");
  fireEvent.click(addNoteButton());

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn't save the note. Please try again.",
  );
  expect(createForm().getByLabelText("Note")).toHaveValue("Don't lose me.");
  expect(createForm().getByLabelText("Page (optional)")).toHaveValue("3");
  expect(api.notes).toEqual([]);
  expect(
    screen.getByText("You haven't written any notes on this book yet."),
  ).toBeInTheDocument();
});

test("21 notes show 20 on page 1 and 1 on page 2", async () => {
  await openAsAlice(makeNotes(21));

  expect(noteItems()).toHaveLength(20);
  expect(noteItems()[0]).toHaveTextContent("Note 21.");
  await goToPage(2);
  expect(noteItems()).toHaveLength(1);
  expect(noteItems()[0]).toHaveTextContent("Note 1.");
});

test("a page that no longer exists returns the section to page 1", async () => {
  const api = await openAsAlice(makeNotes(21));
  // Deleted in another tab: page 2 is gone.
  api.notes.pop();

  fireEvent.click(screen.getByRole("button", { name: "Next" }));

  // Only page 1's refetch shows 20 notes without pagination: page 2 loads
  // without either, and page 1's cached results still have two pages.
  await waitFor(() => {
    expect(noteItems()).toHaveLength(20);
    expect(screen.queryByRole("navigation", { name: "Pagination" })).toBeNull();
  });
  expect(api.gets).toEqual([
    "page=1&page_size=20",
    "page=2&page_size=20",
    "page=1&page_size=20",
  ]);
});

test("a reader without notes on the book sees the empty state", async () => {
  await openAsAlice();

  expect(
    screen.getByText("You haven't written any notes on this book yet."),
  ).toBeInTheDocument();
});
