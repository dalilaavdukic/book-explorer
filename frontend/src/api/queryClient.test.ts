import { MutationObserver } from "@tanstack/react-query";
import { beforeEach, expect, onTestFinished, test, vi } from "vitest";
import { reportUnexpectedError } from "../errorReporting.ts";
import { ApiError, NetworkError } from "./client.ts";
import { createQueryClient } from "./queryClient.ts";

vi.mock("../errorReporting.ts", { spy: true });

beforeEach(() => {
  vi.mocked(reportUnexpectedError).mockClear();
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  onTestFinished(() => consoleError.mockRestore());
});

async function failQuery(error: Error) {
  await createQueryClient()
    .fetchQuery({
      queryKey: ["probe"],
      queryFn: () => Promise.reject(error),
      retry: false,
    })
    .catch(() => undefined);
}

async function failMutation(error: Error) {
  await new MutationObserver(createQueryClient(), {
    mutationFn: () => Promise.reject(error),
  })
    .mutate()
    .catch(() => undefined);
}

test("a bug in a query or mutation is reported", async () => {
  const bug = new TypeError("Cannot read properties of undefined");

  await failQuery(bug);
  await failMutation(bug);

  expect(reportUnexpectedError).toHaveBeenCalledTimes(2);
  expect(reportUnexpectedError).toHaveBeenCalledWith(bug, "request");
});

test("an answer from the API or a lost connection isn't reported", async () => {
  await failQuery(new ApiError(404, { detail: "Not found." }));
  await failQuery(new ApiError(500, null));
  await failMutation(new NetworkError(new TypeError("Failed to fetch")));

  expect(reportUnexpectedError).not.toHaveBeenCalled();
});
