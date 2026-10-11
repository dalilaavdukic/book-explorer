import { http, HttpResponse, type JsonBodyType } from "msw";
import type { Note, NoteRequest, PaginatedNoteList } from "../api/notes.ts";
import { server } from "./server.ts";

const firstNoteTime = Date.UTC(2026, 9, 1, 9, 0);

/** A note written `id` minutes after the first, so a higher id is newer. */
export function makeNote(id: number, fields: Partial<Note> = {}): Note {
  return {
    id,
    body: `Note ${id}.`,
    page: null,
    created_at: new Date(firstNoteTime + id * 60_000).toISOString(),
    edited_at: null,
    ...fields,
  };
}

/** Notes 1 to `count`. */
export function makeNotes(count: number) {
  return Array.from({ length: count }, (_, index) => makeNote(index + 1));
}

function newestFirst(a: Note, b: Note) {
  return b.created_at.localeCompare(a.created_at) || b.id - a.id;
}

/**
 * The reader's notes on one book, kept in memory and served through MSW like
 * the real API: newest first, paged, and "Invalid page." past the last page.
 */
export function serveNotes(bookId: number, notes: Note[] = []) {
  const api = {
    notes: [...notes],
    /** Each GET's query string, in order. */
    gets: [] as string[],
    /** Each POST's body, in order. */
    posts: [] as unknown[],
  };
  let nextId = Math.max(0, ...notes.map((note) => note.id)) + 1;
  const listPath = `/api/books/${bookId}/notes/`;

  server.use(
    http.get(listPath, ({ request }) => {
      const params = new URL(request.url).searchParams;
      api.gets.push(params.toString());
      const page = Number(params.get("page") ?? 1);
      const size = Number(params.get("page_size") ?? 20);
      const sorted = [...api.notes].sort(newestFirst);
      const pageCount = Math.max(1, Math.ceil(sorted.length / size));
      if (!Number.isInteger(page) || page < 1 || page > pageCount) {
        return HttpResponse.json({ detail: "Invalid page." }, { status: 404 });
      }
      return HttpResponse.json<PaginatedNoteList>({
        count: sorted.length,
        next: null,
        previous: null,
        results: sorted.slice((page - 1) * size, page * size),
      });
    }),
    http.post(listPath, async ({ request }) => {
      const body = (await request.json()) as NoteRequest;
      api.posts.push(body);
      const note = makeNote(nextId++, {
        body: body.body.trim(),
        page: body.page ?? null,
      });
      api.notes.push(note);
      return HttpResponse.json(note, { status: 201 });
    }),
  );
  return api;
}

/**
 * Holds the next matching request until released. It's then answered by the
 * handlers registered before, such as the fake API's.
 */
export function holdNext(
  method: "get" | "post" | "patch" | "delete",
  path: string,
) {
  let arrive!: () => void;
  const arrived = new Promise<void>((resolve) => (arrive = resolve));
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  server.use(
    http[method](
      path,
      async () => {
        arrive();
        await released;
      },
      { once: true },
    ),
  );
  return { arrived, release };
}

/** Answers the next matching request with `status` and `body`. */
export function failNext(
  method: "get" | "post" | "patch" | "delete",
  path: string,
  status: number,
  body: JsonBodyType = { detail: "Server error." },
) {
  server.use(
    http[method](path, () => HttpResponse.json(body, { status }), {
      once: true,
    }),
  );
}
