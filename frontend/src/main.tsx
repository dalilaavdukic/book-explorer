import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { createQueryClient } from "./api/queryClient.ts";
import App from "./App.tsx";
import "./styles/global.scss";

const queryClient = createQueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* A URL change renders at once rather than as a transition. Otherwise a
          control that reads the URL, such as a checkbox, shows its old value
          for a frame after it's clicked. */}
      <BrowserRouter useTransitions={false}>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
