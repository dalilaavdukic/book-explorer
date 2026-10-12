import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { createQueryClient } from "./api/queryClient.ts";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import ErrorFallback from "./components/ErrorFallback.tsx";
import layoutStyles from "./components/Layout.module.scss";
import { listenForUnhandledErrors } from "./errorReporting.ts";
import "./styles/global.scss";

listenForUnhandledErrors();

const queryClient = createQueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* For errors outside the routes' own boundary, such as in the header or
        at startup. A plain link, because the router may be what failed. */}
    <ErrorBoundary
      fallback={
        <main className={layoutStyles.main}>
          <ErrorFallback
            message="Something went wrong."
            homeLink={<a href="/">Back to the catalog</a>}
          />
        </main>
      }
    >
      <QueryClientProvider client={queryClient}>
        {/* A URL change renders at once rather than as a transition. Otherwise a
          control that reads the URL, such as a checkbox, shows its old value
          for a frame after it's clicked. */}
        <BrowserRouter useTransitions={false}>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
