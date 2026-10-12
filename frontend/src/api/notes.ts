import type { User } from "./auth.ts";
import { apiGet, apiSend } from "./client.ts";
import type { components, paths } from "./schema";

export type Note = components["schemas"]["Note"];
export type NoteRequest = components["schemas"]["NoteRequest"];
export type PatchedNoteRequest = components["schemas"]["PatchedNoteRequest"];
export type PaginatedNoteList = components["schemas"]["PaginatedNoteList"];
export type NoteListParams = NonNullable<
  paths["/api/books/{book_id}/notes/"]["get"]["parameters"]["query"]
>;

export function fetchNotes(
  reader: User,
  bookId: number,
  params: NoteListParams,
  signal?: AbortSignal,
) {
  return apiGet<PaginatedNoteList>(`/api/books/${bookId}/notes/`, {
    query: params,
    signal,
    reader,
  });
}

export function createNote(
  reader: User | null,
  bookId: number,
  request: NoteRequest,
) {
  return apiSend<Note>("POST", `/api/books/${bookId}/notes/`, {
    body: request,
    reader,
  });
}

export function updateNote(
  reader: User | null,
  id: number,
  request: PatchedNoteRequest,
) {
  return apiSend<Note>("PATCH", `/api/notes/${id}/`, { body: request, reader });
}

export function deleteNote(reader: User | null, id: number) {
  return apiSend<undefined>("DELETE", `/api/notes/${id}/`, { reader });
}
