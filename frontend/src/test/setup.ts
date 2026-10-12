import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect } from "vitest";
import { server } from "./server.ts";

// jsdom's <dialog> only reflects the open attribute. Without it, a closed
// dialog is hidden and an open one visible, as in a browser.
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
  this.open = true;
};
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
  this.open = false;
};

// MSW's "error" strategy only makes fetch reject, which the app shows as an
// ordinary error state, so unhandled requests are collected and fail the test.
const unhandledRequests: string[] = [];

beforeAll(() => {
  server.listen({
    onUnhandledFrame({ frame, defaults }) {
      const { request } = frame.data as { request?: Request };
      unhandledRequests.push(
        request ? `${request.method} ${request.url}` : frame.protocol,
      );
      defaults.error();
    },
  });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  expect(
    unhandledRequests.splice(0),
    "requests without an MSW handler",
  ).toEqual([]);
});

afterAll(() => {
  server.close();
});
