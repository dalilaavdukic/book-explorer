import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { changeSession } from "../auth/session.ts";
import { reportUnexpectedError } from "../errorReporting.ts";
import { ApiError, NetworkError } from "./client.ts";

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
  const onError = (error: Error) => {
    if (error instanceof ApiError) {
      // Any 401 means the reader is logged out. Nothing navigates: each view
      // switches to its logged-out state.
      if (error.status === 401) {
        changeSession(client, null);
      }
    } else if (!(error instanceof NetworkError)) {
      // Neither an answer from the API nor a lost connection: a bug in the
      // request's own code, which the view's Retry would only hide.
      reportUnexpectedError(error, "request");
    }
  };

  const client = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
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
