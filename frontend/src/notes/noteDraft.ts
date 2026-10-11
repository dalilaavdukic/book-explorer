import type { Note } from "../api/notes.ts";

/** What's typed in a note form. The page stays text until it's checked. */
export interface NoteDraft {
  body: string;
  page: string;
}

export const emptyDraft: NoteDraft = { body: "", page: "" };

export function draftFromNote(note: Note): NoteDraft {
  const page = note.page ?? null;
  return { body: note.body, page: page === null ? "" : String(page) };
}

const MAX_PAGE = 10000;

/**
 * The page as the API takes it: null when blank, or undefined when it isn't a
 * whole number from 1 to 10,000.
 */
export function parsePage(text: string): number | null | undefined {
  const value = text.trim();
  if (value === "") {
    return null;
  }
  if (!/^[0-9]+$/.test(value)) {
    return undefined;
  }
  const page = Number(value);
  return page >= 1 && page <= MAX_PAGE ? page : undefined;
}

/** A create draft with anything in it, or an edit that differs from the note. */
export function isUnsaved(draft: NoteDraft, note?: Note) {
  if (note === undefined) {
    return draft.body.trim() !== "" || draft.page.trim() !== "";
  }
  // The generated type marks page optional, though the API always sends it.
  return (
    draft.body !== note.body || parsePage(draft.page) !== (note.page ?? null)
  );
}
