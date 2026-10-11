import { delay, http, HttpResponse } from "msw";
import { expect, onTestFinished, test } from "vitest";
import { server } from "../test/server.ts";
import { ApiError, apiGet, apiSend, NetworkError } from "./client.ts";

function setCsrfCookie(value: string) {
  document.cookie = `csrftoken=${value}; path=/`;
  onTestFinished(() => {
    document.cookie = "csrftoken=; path=/; max-age=0";
  });
}

function recordRequests(path: string) {
  const requests: Request[] = [];
  server.use(
    http.all(path, ({ request }) => {
      requests.push(request.clone());
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return requests;
}

test("returns the JSON body and encodes query parameters", async () => {
  let search = "";
  server.use(
    http.get("/api/books/", ({ request }) => {
      search = new URL(request.url).search;
      return HttpResponse.json({ count: 0 });
    }),
  );

  const body = await apiGet("/api/books/", {
    query: { search: "café & 100%", page: 2, author: undefined },
  });

  expect(body).toEqual({ count: 0 });
  expect(search).toBe("?search=caf%C3%A9+%26+100%25&page=2");
});

test.each([
  [404, { detail: "Not found." }],
  [400, { page_size: ["Enter a whole number from 1 to 100."] }],
])("a %i becomes an ApiError with the DRF body", async (status, body) => {
  server.use(
    http.get("/api/books/", () => HttpResponse.json(body, { status })),
  );

  const error = await apiGet("/api/books/").catch((e: unknown) => e);

  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ status, body });
});

test("an error body that isn't JSON gives a null body", async () => {
  server.use(
    http.get("/api/books/", () =>
      HttpResponse.html("<h1>Server Error</h1>", { status: 500 }),
    ),
  );

  const error = await apiGet("/api/books/").catch((e: unknown) => e);

  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ status: 500, body: null });
});

test("a network failure becomes a NetworkError", async () => {
  server.use(http.get("/api/books/", () => HttpResponse.error()));

  const error = await apiGet("/api/books/").catch((e: unknown) => e);

  expect(error).toBeInstanceOf(NetworkError);
});

test("an aborted request rejects with the abort error, not a NetworkError", async () => {
  server.use(
    http.get("/api/books/", async () => {
      await delay("infinite");
      return HttpResponse.json({});
    }),
  );
  const controller = new AbortController();

  const request = apiGet("/api/books/", { signal: controller.signal });
  controller.abort();
  const error = await request.catch((e: unknown) => e);

  expect(error).not.toBeInstanceOf(NetworkError);
  expect(error).toMatchObject({ name: "AbortError" });
});

test.each(["POST", "PATCH", "DELETE"] as const)(
  "%s sends the CSRF cookie's current value as X-CSRFToken",
  async (method) => {
    const requests = recordRequests("/api/things/1/");

    setCsrfCookie("first-token");
    await apiSend(method, "/api/things/1/");
    setCsrfCookie("second-token");
    await apiSend(method, "/api/things/1/");

    expect(requests.map((request) => request.method)).toEqual([method, method]);
    expect(
      requests.map((request) => request.headers.get("X-CSRFToken")),
    ).toEqual(["first-token", "second-token"]);
  },
);

test("GET sends no CSRF token", async () => {
  const requests = recordRequests("/api/things/1/");
  setCsrfCookie("a-token");

  await apiGet("/api/things/1/");

  expect(requests[0].headers.get("X-CSRFToken")).toBeNull();
});

test("a body is sent as JSON", async () => {
  const requests = recordRequests("/api/things/");

  await apiSend("POST", "/api/things/", { body: { text: "café" } });

  expect(requests[0].headers.get("Content-Type")).toBe("application/json");
  expect(await requests[0].json()).toEqual({ text: "café" });
});

test("a 204 resolves to undefined", async () => {
  recordRequests("/api/things/1/");

  await expect(apiSend("DELETE", "/api/things/1/")).resolves.toBeUndefined();
});
