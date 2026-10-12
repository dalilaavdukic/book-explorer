import { expect, onTestFinished, test, vi } from "vitest";
import { listenForUnhandledErrors } from "./errorReporting.ts";

function spyOnConsoleErrors() {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  onTestFinished(() => spy.mockRestore());
  return spy;
}

function rejectionEvent(reason: unknown) {
  // jsdom has no PromiseRejectionEvent.
  return Object.assign(new Event("unhandledrejection"), { reason });
}

test("errors outside React are reported until the listeners are removed", () => {
  const consoleError = spyOnConsoleErrors();
  const stop = listenForUnhandledErrors();
  const reason = new Error("nobody handled this");
  const thrown = new Error("thrown outside React");

  window.dispatchEvent(rejectionEvent(reason));
  window.dispatchEvent(new ErrorEvent("error", { error: thrown }));

  expect(consoleError).toHaveBeenCalledWith(
    "Unexpected error:",
    reason,
    "unhandled promise rejection",
  );
  expect(consoleError).toHaveBeenCalledWith(
    "Unexpected error:",
    thrown,
    "uncaught error",
  );

  stop();
  consoleError.mockClear();
  window.dispatchEvent(rejectionEvent(reason));

  expect(consoleError).not.toHaveBeenCalled();
});
