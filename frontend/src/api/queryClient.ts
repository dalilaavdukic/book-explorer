import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./client.ts";

// A 4xx answer won't change on retry, and retrying would hold "not found"
// views behind several seconds of loading. Anything else gets one more try.
function retryOnce(failureCount: number, error: Error) {
  if (error instanceof ApiError && error.status < 500) {
    return false;
  }
  return failureCount < 1;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: retryOnce },
    },
  });
}
