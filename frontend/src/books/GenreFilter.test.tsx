import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { makeBook, serveBooks, serveGenres } from "../test/catalogApi.ts";
import { renderApp } from "../test/renderApp.tsx";

const hobbit = makeBook(3, "The Hobbit");

function genresButton() {
  return screen.getByRole("button", { name: /^Genres/ });
}

function panel() {
  return screen.queryByRole("group", { name: "Genres" });
}

async function renderList() {
  serveBooks([hobbit]);
  serveGenres();
  renderApp("/");
  await screen.findByRole("link", { name: "The Hobbit" });
}

async function openGenres() {
  fireEvent.click(genresButton());
  return within(await screen.findByRole("group", { name: "Genres" }));
}

function expectOpen() {
  expect(panel()).toBeInTheDocument();
  expect(genresButton()).toHaveAttribute("aria-expanded", "true");
}

function expectClosed() {
  expect(panel()).toBeNull();
  expect(genresButton()).toHaveAttribute("aria-expanded", "false");
}

test("a click outside closes the panel, and a click on the button toggles it once", async () => {
  await renderList();
  const genres = await openGenres();
  act(() => genres.getByRole("checkbox", { name: "Fantasy" }).focus());

  fireEvent.click(screen.getByRole("heading", { name: "Books" }));

  expectClosed();
  expect(genresButton()).not.toHaveFocus();
  await openGenres();
  fireEvent.click(genresButton());
  expectClosed();
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
  expectClosed();
});

test("focus leaving the control closes the panel", async () => {
  await renderList();
  const genres = await openGenres();
  act(() => genres.getByRole("checkbox", { name: "Fantasy" }).focus());

  act(() => screen.getByRole("combobox", { name: "Sort by" }).focus());

  expectClosed();
});

test("moving focus or clicking inside the control keeps the panel open", async () => {
  await renderList();
  const genres = await openGenres();

  act(() => genres.getByRole("checkbox", { name: "Fantasy" }).focus());
  act(() => genres.getByRole("checkbox", { name: "Dystopian" }).focus());
  expectOpen();

  fireEvent.click(screen.getByText("Genres", { selector: "legend" }));
  expectOpen();
  fireEvent.click(genres.getByText("Fantasy"));
  expectOpen();
  expect(genresButton()).toHaveTextContent("Genres (1)");

  // Focus moves to nothing, as a click on the panel's padding does.
  act(() => genres.getByRole("checkbox", { name: "Dystopian" }).focus());
  act(() => genres.getByRole("checkbox", { name: "Dystopian" }).blur());
  expectOpen();
});
