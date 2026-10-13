import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { User } from "../api/auth.ts";

// No default handlers: each test registers the responses it expects.
export const server = setupServer();

/**
 * From now on the session belongs to `reader`. As the real API does, a request
 * naming another reader in X-Reader-Id gets 412, before any other handler.
 */
export function refuseOtherReaders(reader: User) {
  server.use(
    http.all("/api/*", ({ request }) => {
      const named = request.headers.get("X-Reader-Id");
      if (named !== null && named !== String(reader.id)) {
        return HttpResponse.json(
          { detail: "The session belongs to another reader." },
          { status: 412 },
        );
      }
    }),
  );
}
