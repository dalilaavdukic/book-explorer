import { focusManager } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

/** Each listed note's text; an open edit form is listed as null. */
function listedBodies() {
  return noteItems().map(
    (item) => item.querySelector("p:first-child")?.textContent ?? null,
  );
}

function noteItem(body: string) {
  const item = noteItems().find(
    (candidate) => candidate.querySelector("p")?.textContent === body,
  );
  if (item === undefined) {
    throw new Error(`No listed note reads "${body}".`);
  }
  return within(item);
}

function editForm() {
  return within(screen.getByRole("form", { name: "Edit note" }));
}

function changeEdit(body: string, page?: string) {
  fireEvent.change(editForm().getByLabelText("Note"), {
    target: { value: body },
  });
  if (page !== undefined) {
    fireEvent.change(editForm().getByLabelText("Page (optional)"), {
      target: { value: page },
    });
  }
}

function confirmDelete(body: string) {
  fireEvent.click(noteItem(body).getByRole("button", { name: "Delete" }));
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Delete this note?" })).getByRole(
      "button",
      { name: "Delete" },
    ),
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

/** A request is sent only after awaited steps, so give one time to arrive. */
async function expectNoneSent(requests: unknown[]) {
  await expect(
    waitFor(() => expect(requests).not.toEqual([]), { timeout: 200 }),
  ).rejects.toThrow();
}

async function goToPage(page: number, pageCount = 2) {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText(`Page ${page} of ${pageCount}`);
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

  const loginLink = await screen.findByRole("link", {
    name: "Log in to add notes",
  });
  await expectNoneSent(api.gets);
  fireEvent.click(loginLink);
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
    await expectNoneSent(api.posts);
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

test("editing saves the new text and a cleared page, and stays on the page", async () => {
  const notes = makeNotes(21);
  notes[0].page = 12;
  const api = await openAsAlice(notes);
  await goToPage(2);

  fireEvent.click(noteItem("Note 1.").getByRole("button", { name: "Edit" }));
  expect(editForm().getByRole("button", { name: "Save" })).toBeDisabled();
  changeEdit("Revised.", "");
  fireEvent.click(editForm().getByRole("button", { name: "Save" }));

  await waitFor(() =>
    expect(screen.queryByRole("form", { name: "Edit note" })).toBeNull(),
  );
  expect(api.patches).toEqual([{ body: "Revised.", page: null }]);
  expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  const item = noteItem("Revised.");
  expect(item.queryByText("p. 12")).toBeNull();
  expect(item.getByText(/Edited/)).toBeInTheDocument();
});

test("Cancel discards an edit's changes", async () => {
  const api = await openAsAlice([makeNote(1, { body: "Original." })]);

  fireEvent.click(noteItem("Original.").getByRole("button", { name: "Edit" }));
  changeEdit("Changed.");
  fireEvent.click(editForm().getByRole("button", { name: "Cancel" }));

  expect(listedBodies()).toEqual(["Original."]);
  fireEvent.click(noteItem("Original.").getByRole("button", { name: "Edit" }));
  expect(editForm().getByLabelText("Note")).toHaveValue("Original.");
  expect(api.patches).toEqual([]);
});

test("Cancel stays disabled while an edit saves", async () => {
  const api = await openAsAlice([makeNote(1, { body: "Original." })]);
  const patch = holdNext("patch", "/api/notes/1/");

  fireEvent.click(noteItem("Original.").getByRole("button", { name: "Edit" }));
  changeEdit("Changed.");
  fireEvent.click(editForm().getByRole("button", { name: "Save" }));
  await patch.arrived;

  await waitFor(() =>
    expect(editForm().getByRole("button", { name: "Cancel" })).toBeDisabled(),
  );
  patch.release();
  await waitFor(() =>
    expect(screen.queryByRole("form", { name: "Edit note" })).toBeNull(),
  );
  expect(api.patches).toEqual([{ body: "Changed.", page: null }]);
});

test("a failed edit says so and keeps the changes", async () => {
  await openAsAlice([makeNote(1, { body: "Original.", page: 3 })]);
  failNext("patch", "/api/notes/1/", 500);

  fireEvent.click(noteItem("Original.").getByRole("button", { name: "Edit" }));
  changeEdit("Changed.", "4");
  fireEvent.click(editForm().getByRole("button", { name: "Save" }));

  expect(await editForm().findByRole("alert")).toHaveTextContent(
    "Couldn't save the note. Please try again.",
  );
  expect(editForm().getByLabelText("Note")).toHaveValue("Changed.");
  expect(editForm().getByLabelText("Page (optional)")).toHaveValue("4");
});

test("Cancel in the delete dialog keeps the note, and Delete removes it", async () => {
  const api = await openAsAlice(makeNotes(2));

  fireEvent.click(noteItem("Note 2.").getByRole("button", { name: "Delete" }));
  const dialog = within(
    screen.getByRole("dialog", { name: "Delete this note?" }),
  );
  expect(dialog.getByText("This can't be undone.")).toBeInTheDocument();
  fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(listedBodies()).toEqual(["Note 2.", "Note 1."]);

  confirmDelete("Note 2.");

  expect(
    noteItem("Note 2.").getByRole("button", { name: "Deleting…" }),
  ).toBeDisabled();
  await waitFor(() => expect(listedBodies()).toEqual(["Note 1."]));
  expect(api.notes.map(({ id }) => id)).toEqual([1]);
});

test("deleting the only note on the last page shows the page before it", async () => {
  const api = await openAsAlice(makeNotes(41));
  await goToPage(2, 3);
  await goToPage(3, 3);
  const getsBefore = api.gets.length;

  confirmDelete("Note 1.");

  await screen.findByText("Page 2 of 2");
  expect(noteItems()).toHaveLength(20);
  const getsAfter = api.gets.slice(getsBefore);
  expect(getsAfter).toContain("page=2&page_size=20");
  expect(getsAfter).not.toContain("page=3&page_size=20");
});

test("a failed delete says so and leaves the note visible", async () => {
  await openAsAlice(makeNotes(1));
  failNext("delete", "/api/notes/1/", 500);

  confirmDelete("Note 1.");

  expect(await noteItem("Note 1.").findByRole("alert")).toHaveTextContent(
    "Couldn't delete the note. Please try again.",
  );
  expect(listedBodies()).toEqual(["Note 1."]);
  expect(
    noteItem("Note 1.").getByRole("button", { name: "Delete" }),
  ).toBeEnabled();
});

test.each([
  {
    change: "editing",
    run: () => {
      fireEvent.click(
        noteItem("Note 2.").getByRole("button", { name: "Edit" }),
      );
      changeEdit("Changed.");
      fireEvent.click(editForm().getByRole("button", { name: "Save" }));
    },
  },
  { change: "deleting", run: () => confirmDelete("Note 2.") },
])(
  "$change a note deleted elsewhere says so and refreshes the list",
  async ({ run }) => {
    const api = await openAsAlice(makeNotes(3));
    api.notes.splice(1, 1);

    run();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That note no longer exists. It may have been deleted in another tab.",
    );
    await waitFor(() => expect(listedBodies()).toEqual(["Note 3.", "Note 1."]));
    expect(screen.queryByRole("form", { name: "Edit note" })).toBeNull();
  },
);

test("an open edit stays on screen when its note leaves the list", async () => {
  const api = await openAsAlice(makeNotes(3));
  fireEvent.click(noteItem("Note 2.").getByRole("button", { name: "Edit" }));
  changeEdit("Changed.");
  api.notes.splice(1, 1);

  await refetchOnFocus();

  await waitFor(() => expect(listedBodies()).toEqual(["Note 3.", "Note 1."]));
  expect(editForm().getByLabelText("Note")).toHaveValue("Changed.");
  for (const body of ["Note 3.", "Note 1."]) {
    expect(noteItem(body).getByRole("button", { name: "Edit" })).toBeDisabled();
  }

  fireEvent.click(editForm().getByRole("button", { name: "Save" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "That note no longer exists. It may have been deleted in another tab.",
  );
  expect(screen.queryByRole("form", { name: "Edit note" })).toBeNull();
  for (const body of ["Note 3.", "Note 1."]) {
    expect(noteItem(body).getByRole("button", { name: "Edit" })).toBeEnabled();
  }
});
