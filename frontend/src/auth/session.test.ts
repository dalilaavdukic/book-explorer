import {
  isCancelledError,
  MutationObserver,
  type QueryClient,
  QueryObserver,
} from "@tanstack/react-query";
import { http, HttpResponse, type JsonBodyType } from "msw";
import { expect, onTestFinished, test, vi } from "vitest";
import type { Session, User } from "../api/auth.ts";
import { apiGet, apiSend } from "../api/client.ts";
import { createQueryClient } from "../api/queryClient.ts";
import { server } from "../test/server.ts";
import {
  changeSession,
  draftsKey,
  privateQueryOptions,
  sessionKey,
  sessionQuery,
} from "./session.ts";

const alice: User = { id: 1, username: "alice" };
const bob: User = { id: 2, username: "bob" };

const publicKey = ["books", "detail", 7];

function serveSession(user: User | null) {
  const requests: Request[] = [];
  server.use(
    http.get("/api/auth/session/", ({ request }) => {
      requests.push(request);
      return HttpResponse.json<Session>({ user });
    }),
  );
  return requests;
}

/** Answers the next request only once released. */
function holdRequest(path: string, body: JsonBodyType) {
  let arrive!: () => void;
  const arrived = new Promise<void>((resolve) => (arrive = resolve));
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  server.use(
    http.get(
      path,
      async () => {
        arrive();
        await released;
        return HttpResponse.json(body);
      },
      { once: true },
    ),
  );
  return { arrived, release };
}

/** A client whose startup check found `user`, with a private and a public entry. */
async function startSession(user: User | null) {
  serveSession(user);
  const client = createQueryClient();
  await client.fetchQuery(sessionQuery);
  client.setQueryData(["private", user?.id ?? null, "notes", 7], ["a note"]);
  client.setQueryData(publicKey, { title: "A book" });
  return client;
}

function privateEntries(client: QueryClient) {
  return client.getQueryCache().findAll({ queryKey: ["private"] });
}

test.each([
  {
    change: "nobody → alice (a login)",
    from: null,
    to: alice,
    run: (client: QueryClient) => changeSession(client, alice),
  },
  {
    change: "alice → nobody (a logout)",
    from: alice,
    to: null,
    run: (client: QueryClient) => changeSession(client, null),
  },
  {
    change: "alice → bob (a re-check)",
    from: alice,
    to: bob,
    run: (client: QueryClient) => {
      serveSession(bob);
      return client.refetchQueries({ queryKey: sessionKey });
    },
  },
])(
  "$change removes every private entry and keeps the public ones",
  async ({ from, to, run }) => {
    const client = await startSession(from);

    await run(client);

    expect(client.getQueryData(sessionKey)).toEqual(to);
    expect(privateEntries(client)).toEqual([]);
    expect(client.getQueryData(publicKey)).toBeDefined();
  },
);

test("a re-check that finds the same reader keeps the private entries", async () => {
  const client = await startSession(alice);
  const checks = serveSession(alice);

  await client.refetchQueries({ queryKey: sessionKey });

  expect(checks).toHaveLength(1);
  expect(client.getQueryData(sessionKey)).toEqual(alice);
  expect(privateEntries(client)).toHaveLength(1);
});

function recheck(client: QueryClient, user: User | null) {
  serveSession(user);
  return client.refetchQueries({ queryKey: sessionKey });
}

interface DraftCase {
  change: string;
  from?: User | null;
  run: (client: QueryClient) => unknown;
}

test.each<DraftCase>([
  {
    change: "a login (nobody → alice)",
    from: null,
    run: (client: QueryClient) => changeSession(client, alice),
  },
  {
    change: "a logout in this tab",
    from: alice,
    run: (client: QueryClient) =>
      changeSession(client, null, { loggedOutHere: true }),
  },
  {
    change: "a re-check that finds bob after alice",
    from: alice,
    run: (client: QueryClient) => recheck(client, bob),
  },
  {
    change: "a re-check that finds alice after her session ended",
    from: alice,
    run: (client: QueryClient) => {
      changeSession(client, null);
      return recheck(client, alice);
    },
  },
])("$change discards note drafts", async ({ from = alice, run }) => {
  const client = await startSession(from);
  const before = client.getQueryData<number>(draftsKey) ?? 0;

  await run(client);

  expect(client.getQueryData(draftsKey)).toBe(before + 1);
});

test.each<DraftCase>([
  {
    change: "a 401",
    run: (client: QueryClient) => changeSession(client, null),
  },
  {
    change: "a re-check that finds nobody",
    run: (client: QueryClient) => recheck(client, null),
  },
  {
    change: "a re-check that finds the same reader",
    run: (client: QueryClient) => recheck(client, alice),
  },
])("$change keeps note drafts", async ({ run }) => {
  const client = await startSession(alice);
  const before = client.getQueryData<number>(draftsKey);

  await run(client);

  expect(client.getQueryData(draftsKey)).toBe(before);
});

test.each([
  {
    source: "query",
    request: (client: QueryClient) =>
      client.fetchQuery({
        queryKey: ["books", "list"],
        queryFn: () => apiGet("/api/books/"),
      }),
  },
  {
    source: "mutation",
    request: (client: QueryClient) =>
      new MutationObserver(client, {
        mutationFn: () => apiSend("POST", "/api/books/"),
      }).mutate(),
  },
])(
  "a 401 from a $source logs the reader out and removes the private entries",
  async ({ request }) => {
    const client = await startSession(alice);
    server.use(
      http.all("/api/books/", () =>
        HttpResponse.json(
          { detail: "Authentication credentials were not provided." },
          { status: 401 },
        ),
      ),
    );

    await expect(request(client)).rejects.toMatchObject({ status: 401 });

    expect(client.getQueryData(sessionKey)).toBeNull();
    expect(privateEntries(client)).toEqual([]);
    expect(client.getQueryData(publicKey)).toBeDefined();
  },
);

test("a private request in flight is cancelled when the reader changes", async () => {
  const client = await startSession(alice);
  const notes = holdRequest("/api/notes/", ["alice's note"]);
  let signal: AbortSignal | undefined;
  const request = client.fetchQuery(
    privateQueryOptions(alice, ["notes"], (context) => {
      signal = context.signal;
      return apiGet("/api/notes/", { signal });
    }),
  );
  await notes.arrived;

  changeSession(client, null);
  notes.release();

  await expect(request).rejects.toSatisfy(isCancelledError);
  expect(signal?.aborted).toBe(true);
  expect(privateEntries(client)).toEqual([]);
});

test("a session check in flight can't put the reader back after a logout", async () => {
  const client = await startSession(alice);
  const check = holdRequest("/api/auth/session/", { user: alice });
  const recheck = client.refetchQueries({ queryKey: sessionKey });
  await check.arrived;

  changeSession(client, null);
  check.release();
  await recheck;

  expect(client.getQueryData(sessionKey)).toBeNull();
});

test("a private query sends no request without a reader", async () => {
  const client = createQueryClient();
  const queryFn = vi.fn(() => Promise.resolve([]));
  const observer = new QueryObserver(
    client,
    privateQueryOptions(null, ["notes", 7], queryFn),
  );
  onTestFinished(observer.subscribe(() => {}));

  await new Promise((resolve) => setTimeout(resolve));

  expect(queryFn).not.toHaveBeenCalled();
});

test("a private query's key starts with the private root and the reader's id", () => {
  const options = privateQueryOptions(alice, ["notes", 7], () =>
    Promise.resolve([]),
  );

  expect(options.queryKey).toEqual(["private", 1, "notes", 7]);
});
