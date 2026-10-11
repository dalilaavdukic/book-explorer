import { screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderApp } from "./test/renderApp.tsx";

test("renders the app shell", () => {
  renderApp("/");

  expect(screen.getByRole("link", { name: "Book Explorer" })).toHaveAttribute(
    "href",
    "/",
  );
  expect(screen.getByRole("main")).toBeInTheDocument();
});

test("an unknown route shows Page not found with a link to the catalog", () => {
  renderApp("/nope");

  expect(
    screen.getByRole("heading", { name: "Page not found" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Back to the catalog" }),
  ).toHaveAttribute("href", "/");
});
