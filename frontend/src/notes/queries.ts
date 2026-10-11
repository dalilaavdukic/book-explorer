import { type QueryClient, useMutation, useQuery } from "@tanstack/react-query";
import type { User } from "../api/auth.ts";
import { createNote, fetchNotes, type NoteRequest } from "../api/notes.ts";
import {
  privateKey,
  privateQueryOptions,
  sessionKey,
} from "../auth/session.ts";

export const NOTES_PAGE_SIZE = 20;

function notesQuery(user: User | null, bookId: number, page: number) {
  return privateQueryOptions(user, ["notes", bookId, page], ({ signal }) =>
    fetchNotes(bookId, { page, page_size: NOTES_PAGE_SIZE }, signal),
  );
}

export function useNotes(user: User | null, bookId: number, page: number) {
  return useQuery(notesQuery(user, bookId, page));
}

interface NoteChange {
  /** The notes page the section shows once the change is saved. */
  targetPage: number;
}

function sessionReader(client: QueryClient) {
  return client.getQueryData<User | null>(sessionKey) ?? null;
}

// A create or delete shifts notes between pages, so every cached page of the
// book's notes may be out of date. Only the page the section lands on is
// fetched, and the change counts as saved once it's there (arch §8.4).
async function refreshNotes(
  client: QueryClient,
  reader: User | null,
  bookId: number,
  page: number,
) {
  await client.invalidateQueries({
    queryKey: privateKey(reader, "notes", bookId),
    refetchType: "none",
  });
  // If the reader changed meanwhile, the answer would be the next reader's
  // notes, stored under this reader's key.
  if (reader === null || sessionReader(client)?.id !== reader.id) {
    return;
  }
  await client.prefetchQuery(notesQuery(reader, bookId, page));
}

export function useCreateNote(bookId: number) {
  return useMutation({
    mutationFn: ({ request }: NoteChange & { request: NoteRequest }) =>
      createNote(bookId, request),
    // The finished mutation keeps the note's text; it mustn't outlive the
    // section, as with the login mutation's password.
    gcTime: 0,
    onMutate: (_variables, { client }) => sessionReader(client),
    onSuccess: (_note, { targetPage }, reader, { client }) =>
      refreshNotes(client, reader, bookId, targetPage),
  });
}
