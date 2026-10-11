import {
  type QueryClient,
  type QueryFunction,
  queryOptions,
  skipToken,
  useQuery,
} from "@tanstack/react-query";
import { fetchSession, type User } from "../api/auth.ts";

export const sessionKey = ["session"] as const;

// Every query whose answer depends on who is logged in lives under this root,
// keyed by the reader's id, so one call finds them all.
const privateRoot = "private";

// A counter outside the private root. NotesSection uses it in its React key, so
// increasing it remounts the section and discards every open note draft.
export const draftsKey = ["drafts"] as const;

interface SessionChange {
  /** The reader logged out in this tab, so their drafts are discarded. */
  loggedOutHere?: boolean;
}

export const sessionQuery = queryOptions({
  queryKey: sessionKey,
  queryFn: async ({ client, signal }): Promise<User | null> => {
    const { user } = await fetchSession(signal);
    // changeSession cancels a check still in flight. If its answer had already
    // arrived, it mustn't undo that change.
    signal.throwIfAborted();
    applySession(client, user);
    return user;
  },
  // Never stale, so useAuth doesn't refetch, but re-checked whenever the tab
  // regains focus, to notice a logout or another reader's login in another tab.
  staleTime: Infinity,
  refetchOnWindowFocus: "always",
});

/** The only code that writes the session. */
function applySession(
  client: QueryClient,
  user: User | null,
  { loggedOutHere = false }: SessionChange = {},
) {
  const previousId = client.getQueryData<User | null>(sessionKey)?.id ?? null;
  const userId = user?.id ?? null;
  client.setQueryData<User | null>(sessionKey, user);
  if (previousId !== userId) {
    void client.cancelQueries({ queryKey: [privateRoot] });
    client.removeQueries({ queryKey: [privateRoot] });
  }
  // Drafts survive only a session that ended on its own (a 401, or a re-check
  // that finds nobody), so the reader can copy them. A reader this tab wasn't
  // showing never sees them (arch §8.5).
  if (loggedOutHere || (userId !== null && userId !== previousId)) {
    client.setQueryData<number>(draftsKey, (version = 0) => version + 1);
  }
}

/** Login, logout and any 401 change the session through here. */
export function changeSession(
  client: QueryClient,
  user: User | null,
  change: SessionChange = {},
) {
  // A session check sent before this change would answer with the old reader.
  void client.cancelQueries({ queryKey: sessionKey });
  applySession(client, user, change);
}

/** The logged-in reader, or null. Only for components rendered after startup. */
export function useAuth() {
  const { data: user } = useQuery(sessionQuery);
  if (user === undefined) {
    throw new Error("useAuth() was called before the session was known.");
  }
  return { user };
}

/** Changes whenever the session function discards note drafts. */
export function useDraftsVersion() {
  const { data = 0 } = useQuery({
    queryKey: draftsKey,
    queryFn: skipToken,
    staleTime: Infinity,
  });
  return data;
}

/** The cache key of something private to `user`. */
export function privateKey(user: User | null, ...key: readonly unknown[]) {
  return [privateRoot, user?.id ?? null, ...key];
}

/** Options for a query that depends on who is logged in. */
export function privateQueryOptions<T>(
  user: User | null,
  key: readonly unknown[],
  queryFn: QueryFunction<T>,
) {
  return queryOptions({
    queryKey: privateKey(user, ...key),
    queryFn,
    enabled: user !== null,
  });
}
