import { apiGet, apiSend } from "./client.ts";
import type { components } from "./schema";

export type User = components["schemas"]["User"];
export type Session = components["schemas"]["Session"];
export type LoginRequest = components["schemas"]["LoginRequest"];

export function fetchSession(signal?: AbortSignal) {
  return apiGet<Session>("/api/auth/session/", { signal });
}

export function login(credentials: LoginRequest) {
  return apiSend<Session>("POST", "/api/auth/login/", { body: credentials });
}

export function logout() {
  return apiSend<undefined>("POST", "/api/auth/logout/");
}
