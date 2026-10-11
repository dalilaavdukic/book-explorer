import { setupServer } from "msw/node";

// No default handlers: each test registers the responses it expects.
export const server = setupServer();
