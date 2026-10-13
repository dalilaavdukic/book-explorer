import type { User } from "./auth.ts";

export class ApiError extends Error {
  readonly status: number;
  /** DRF's error body, or null when the response isn't JSON. */
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`The API answered ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export class NetworkError extends Error {
  constructor(cause: unknown) {
    super("The server could not be reached", { cause });
    this.name = "NetworkError";
  }
}

type QueryScalar = string | number;
type QueryValue = QueryScalar | QueryScalar[] | undefined;

interface ReaderOption {
  /**
   * The reader this tab shows, for a request about their private data. The
   * server refuses it with 412 if the session now belongs to someone else.
   */
  reader?: User | null;
}

function readerHeaders(
  reader: User | null | undefined,
): Record<string, string> {
  return reader ? { "X-Reader-Id": String(reader.id) } : {};
}

interface GetOptions extends ReaderOption {
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
}

export function apiGet<T>(
  path: string,
  { query = {}, signal, reader }: GetOptions = {},
): Promise<T> {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      params.append(name, String(item));
    }
  }
  const search = params.toString();

  return request<T>(search ? `${path}?${search}` : path, {
    headers: { Accept: "application/json", ...readerHeaders(reader) },
    signal,
  });
}

interface SendOptions extends ReaderOption {
  body?: unknown;
  signal?: AbortSignal;
}

/** A write. A 204 resolves to undefined. */
export function apiSend<T>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  { body, signal, reader }: SendOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...readerHeaders(reader),
  };
  // Read on every call: Django issues a new token at each login.
  const csrfToken = readCookie("csrftoken");
  if (csrfToken) {
    headers["X-CSRFToken"] = csrfToken;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  return request<T>(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    // A cancelled query isn't a failure: TanStack Query expects the abort error.
    if (init.signal?.aborted) {
      throw error;
    }
    throw new NetworkError(error);
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readJson(response));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readCookie(name: string) {
  const prefix = `${name}=`;
  return document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(prefix))
    ?.slice(prefix.length);
}
