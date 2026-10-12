import { QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { useLayoutEffect } from "react";
import {
  type Location,
  MemoryRouter,
  type NavigateFunction,
  type NavigationType,
  type To,
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router-dom";
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

interface RouterState {
  location: Location;
  navigationType: NavigationType;
  navigate: NavigateFunction;
}

/**
 * Reports the router's state as React commits each navigation, so a test never
 * sees a page before its location.
 */
// eslint-disable-next-line react-refresh/only-export-components -- a test helper, never hot-reloaded
function RouterProbe({ report }: { report: (state: RouterState) => void }) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  useLayoutEffect(() => {
    report({ location, navigationType, navigate });
  }, [report, location, navigationType, navigate]);
  return null;
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

  let router: RouterState | undefined;
  const report = (state: RouterState) => {
    router = state;
  };
  const current = () => {
    if (router === undefined) {
      throw new Error("The router hasn't rendered yet.");
    }
    return router;
  };

  const result = render(
    <QueryClientProvider client={queryClient}>
      {/* As in main.tsx. */}
      <MemoryRouter initialEntries={[route]} useTransitions={false}>
        <App />
        <RouterProbe report={report} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return {
    ...result,
    /** The current location. */
    location: () => current().location,
    /** How the current location was reached: PUSH, REPLACE or POP. */
    navigationType: () => current().navigationType,
    /** Goes to a location, or moves through the history by `delta` entries. */
    navigate: (to: To | number) =>
      act(() => {
        const { navigate } = current();
        void (typeof to === "number" ? navigate(to) : navigate(to));
      }),
  };
}
