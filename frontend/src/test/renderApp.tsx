import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import type { Session, User } from "../api/auth.ts";
import { createQueryClient } from "../api/queryClient.ts";
import App from "../App.tsx";
import { server } from "./server.ts";

interface RenderAppOptions {
  /** Who the session endpoint says is logged in. A visitor by default. */
  user?: User | null;
  /** Never answer the session request, to see the app before it's known. */
  holdSession?: boolean;
}

export function renderApp(
  route = "/",
  { user = null, holdSession = false }: RenderAppOptions = {},
) {
  server.use(
    http.get("/api/auth/session/", async () => {
      if (holdSession) {
        await delay("infinite");
      }
      return HttpResponse.json<Session>({ user });
    }),
  );

  const queryClient = createQueryClient();
  const defaults = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({
    ...defaults,
    queries: { ...defaults.queries, retry: false },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
