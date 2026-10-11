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

type QueryValue = string | number | undefined;

interface GetOptions {
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
}

export async function apiGet<T>(
  path: string,
  { query = {}, signal }: GetOptions = {},
): Promise<T> {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.append(name, String(value));
    }
  }
  const search = params.toString();

  let response: Response;
  try {
    response = await fetch(search ? `${path}?${search}` : path, {
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (error) {
    // A cancelled query isn't a failure: TanStack Query expects the abort error.
    if (signal?.aborted) {
      throw error;
    }
    throw new NetworkError(error);
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readJson(response));
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
