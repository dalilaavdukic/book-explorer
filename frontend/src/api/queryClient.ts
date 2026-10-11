import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { changeSession } from "../auth/session.ts";
import { ApiError } from "./client.ts";

function isClientError(error: Error | null) {
  return error instanceof ApiError && error.status < 500;
}

// A 4xx answer won't change on retry, and retrying would hold "not found"
// views behind several seconds of loading. Anything else gets one more try.
function retryOnce(failureCount: number, error: Error) {
  if (isClientError(error)) {
    return false;
  }
  return failureCount < 1;
}

export function createQueryClient() {
  // Any 401 means the reader is logged out. Nothing navigates: each view
  // switches to its logged-out state.
  const logOutOn401 = (error: Error) => {
    if (error instanceof ApiError && error.status === 401) {
      changeSession(client, null);
    }
  };

  const client = new QueryClient({
    queryCache: new QueryCache({ onError: logOutOn401 }),
    mutationCache: new MutationCache({ onError: logOutOn401 }),
    defaultOptions: {
      queries: {
        retry: retryOnce,
        // A query that failed without data shows its loading state again while
        // it refetches, so a "not found" view would flash on every tab focus.
        refetchOnWindowFocus: (query) => !isClientError(query.state.error),
      },
    },
  });
  return client;
}
