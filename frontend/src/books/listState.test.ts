import { skipToken } from "@tanstack/react-query";
import { describe, expect, test } from "vitest";
import type { User } from "../api/auth.ts";
import { type BookListState, readBookListState } from "./listState.ts";
import { bookListQuery } from "./queries.ts";

const DEFAULTS: BookListState = {
  page: 1,
  search: "",
  author: null,
  genre: [],
  has_notes: false,
  sort: "title",
};

function read(search: string) {
  return readBookListState(new URLSearchParams(search));
}

function state(search: string) {
  const result = read(search);
  if (typeof result === "string") {
    throw new Error(`${search} isn't a valid list URL: ${result}`);
  }
  return result;
}

describe("reading the URL", () => {
  test.each([
    ["", {}],
    ["page=&search=&author=&genre=&has_notes=&sort=", {}],
    ["utm_source=mail&GENRE=abc", {}],
    ["page=3", { page: 3 }],
    ["search=%20%20Hobbit%20%0A", { search: "Hobbit" }],
    ["search=%20%20", {}],
    ["author=42", { author: 42 }],
    ["genre=5", { genre: [5] }],
    ["genre=5&genre=2&genre=5&genre=", { genre: [2, 5] }],
    ["has_notes=true", { has_notes: true }],
    ["has_notes=false", {}],
    ["sort=title", {}],
    ["sort=-title", { sort: "-title" }],
    ["sort=author", { sort: "author" }],
    ["sort=-author", { sort: "-author" }],
    ["sort=year", { sort: "year" }],
    ["sort=-year", { sort: "-year" }],
  ] as const)("%s is read with its defaults", (search, values) => {
    expect(read(search)).toEqual({ ...DEFAULTS, ...values });
  });

  test.each([
    "page=abc",
    "page=0",
    "page=01",
    "page=-1",
    "page=1.5",
    "page=%201",
    "page=99999999999999999999",
  ])("%s is an invalid page", (search) => {
    expect(read(search)).toBe("invalid-page");
  });

  test.each([
    "author=abc",
    "author=0",
    "author=07",
    "author=99999999999999999999",
    "genre=abc",
    "genre=2&genre=abc",
    "genre=-3",
    "genre=99999999999999999999",
    "has_notes=1",
    "has_notes=TRUE",
    "has_notes=banana",
    "sort=banana",
    "sort=Title",
    "sort=%20title",
    "sort=--title",
    "sort=-",
    "page=abc&sort=banana",
  ])("%s is an invalid filter", (search) => {
    expect(read(search)).toBe("invalid-filters");
  });
});

describe("the list's cache key", () => {
  const alice: User = { id: 1, username: "alice" };

  test("a has_notes list is private to the reader, and waits for one", () => {
    const params = state("has_notes=true&genre=2");

    expect(bookListQuery(alice, params).queryKey).toEqual([
      "private",
      1,
      "books",
      "list",
      params,
    ]);
    expect(bookListQuery(alice, params).queryFn).toBeTypeOf("function");
    expect(bookListQuery(null, params).queryFn).toBe(skipToken);
  });

  test("every other list is public, whoever asks", () => {
    const params = state("search=hobbit&genre=2&sort=-year");

    for (const user of [alice, null]) {
      const query = bookListQuery(user, params);
      expect(query.queryKey).toEqual(["books", "list", params]);
      expect(query.queryFn).toBeTypeOf("function");
    }
  });

  test("has_notes=false and no has_notes share one entry", () => {
    expect(bookListQuery(alice, state("has_notes=false")).queryKey).toEqual(
      bookListQuery(alice, state("")).queryKey,
    );
  });
});
