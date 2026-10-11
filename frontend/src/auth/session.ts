import {
  type QueryClient,
  type QueryFunction,
  queryOptions,
  useQuery,
} from "@tanstack/react-query";
import { fetchSession, type User } from "../api/auth.ts";

export const sessionKey = ["session"] as const;

// Every query whose answer depends on who is logged in lives under this root,
// keyed by the reader's id, so one call finds them all.
const privateRoot = "private";

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
function applySession(client: QueryClient, user: User | null) {
  const previousId = client.getQueryData<User | null>(sessionKey)?.id ?? null;
  client.setQueryData<User | null>(sessionKey, user);
  if (previousId !== (user?.id ?? null)) {
    void client.cancelQueries({ queryKey: [privateRoot] });
    client.removeQueries({ queryKey: [privateRoot] });
  }
}

/** Login, logout and any 401 change the session through here. */
export function changeSession(client: QueryClient, user: User | null) {
  // A session check sent before this change would answer with the old reader.
  void client.cancelQueries({ queryKey: sessionKey });
  applySession(client, user);
}

/** The logged-in reader, or null. Only for components rendered after startup. */
export function useAuth() {
  const { data: user } = useQuery(sessionQuery);
  if (user === undefined) {
    throw new Error("useAuth() was called before the session was known.");
  }
  return { user };
}

/** Options for a query that depends on who is logged in. */
export function privateQueryOptions<T>(
  user: User | null,
  key: readonly unknown[],
  queryFn: QueryFunction<T>,
) {
  return queryOptions({
    queryKey: [privateRoot, user?.id ?? null, ...key],
    queryFn,
    enabled: user !== null,
  });
}
