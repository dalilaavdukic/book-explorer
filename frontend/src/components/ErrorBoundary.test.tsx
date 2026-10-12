import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, onTestFinished, test, vi } from "vitest";
import type { User } from "../api/auth.ts";
import type { Book, BookDetail } from "../api/books.ts";
import { reportUnexpectedError } from "../errorReporting.ts";
import { serveBook, serveBooks } from "../test/catalogApi.ts";
import { makeNote, serveNotes } from "../test/notesApi.ts";
import { renderApp } from "../test/renderApp.tsx";

vi.mock("../errorReporting.ts", { spy: true });

const book: Book = {
  id: 7,
  title: "Nineteen Eighty-Four",
  author: { id: 1, name: "George Orwell" },
  genre: { id: 2, name: "Dystopian" },
  publication_year: 1949,
};

const bookDetail: BookDetail = {
  ...book,
  description: "A party worker risks everything on a quiet rebellion.",
};

const alice: User = { id: 1, username: "alice" };

beforeEach(() => {
  vi.mocked(reportUnexpectedError).mockClear();
  // React and the error report both write the caught error to the console.
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  onTestFinished(() => consoleError.mockRestore());
});

test("a page that fails to render shows the fallback and keeps the header usable", async () => {
  serveBook(bookDetail);
  serveNotes(7, [makeNote(1, { created_at: "not a date" })]);
  serveBooks([book]);
  renderApp("/books/7", { user: alice });

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Something went wrong on this page.",
  );
  expect(reportUnexpectedError).toHaveBeenCalledWith(
    expect.any(RangeError),
    expect.stringContaining("NoteItem"),
  );

  fireEvent.click(screen.getByRole("link", { name: "Book Explorer" }));

  expect(
    await screen.findByRole("link", { name: "Nineteen Eighty-Four" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("an error on a filtered list is cleared by going back to the catalog", async () => {
  const broken = { ...book, author: null } as unknown as Book;
  serveBooks((params) =>
    params.get("search") === "broken" ? [broken] : [book],
  );
  const app = renderApp("/?search=broken");

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Something went wrong on this page.",
  );

  fireEvent.click(screen.getByRole("link", { name: "Back to the catalog" }));

  expect(
    await screen.findByRole("link", { name: "Nineteen Eighty-Four" }),
  ).toBeInTheDocument();
  expect(app.location().search).toBe("");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
