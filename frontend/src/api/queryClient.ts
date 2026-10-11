import { QueryClient } from "@tanstack/react-query";
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
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: retryOnce,
        // A query that failed without data shows its loading state again while
        // it refetches, so a "not found" view would flash on every tab focus.
        refetchOnWindowFocus: (query) => !isClientError(query.state.error),
      },
    },
  });
}
