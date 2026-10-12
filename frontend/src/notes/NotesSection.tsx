import { useEffect, useId, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ApiError } from "../api/client.ts";
import type { Note, NoteRequest } from "../api/notes.ts";
import { useAuth, useDraftsVersion } from "../auth/session.ts";
import EmptyState from "../components/EmptyState.tsx";
import ErrorState from "../components/ErrorState.tsx";
import LoadingState from "../components/LoadingState.tsx";
import Pagination from "../components/Pagination.tsx";
import NoteForm from "./NoteForm.tsx";
import NoteItem from "./NoteItem.tsx";
import {
  draftFromNote,
  emptyDraft,
  isUnsaved,
  type NoteDraft,
} from "./noteDraft.ts";
import styles from "./NotesSection.module.scss";
import {
  NOTES_PAGE_SIZE,
  useCreateNote,
  useDeleteNote,
  useNotes,
  useUpdateNote,
} from "./queries.ts";

const NOTE_GONE =
  "That note no longer exists. It may have been deleted in another tab.";

function hasStatus(error: Error | null, status: number) {
  return error instanceof ApiError && error.status === status;
}

/**
 * The note being edited, copied when the edit opened, and its draft. Once the
 * session has ended, only the draft is kept.
 */
interface Edit {
  note: Note | null;
  draft: NoteDraft;
}

export default function NotesSection({ bookId }: { bookId: number }) {
  const draftsVersion = useDraftsVersion();
  // A new key remounts the section, which discards every draft (arch §8.5).
  // React Router keeps the book page mounted when only its id changes, so the
  // key includes the book: nothing carries over between books.
  return <BookNotes key={`${bookId}:${draftsVersion}`} bookId={bookId} />;
}

function BookNotes({ bookId }: { bookId: number }) {
  const { user } = useAuth();
  const location = useLocation();
  const headingId = useId();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState(emptyDraft);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const notes = useNotes(user, bookId, page);
  const create = useCreateNote(bookId);
  const update = useUpdateNote(bookId);
  const remove = useDeleteNote(bookId);
  const readerId = user?.id ?? null;
  const [shownReaderId, setShownReaderId] = useState(readerId);
  const { reset: resetCreate } = create;
  const { reset: resetUpdate } = update;
  const { reset: resetRemove } = remove;

  // A reader who appears remounts the section instead (arch §8.5), so this is
  // a session that ended on its own: only unsaved drafts stay, without the
  // note an edit started from (AC-N12, AC-A8).
  if (readerId !== shownReaderId) {
    setShownReaderId(readerId);
    setNotice(null);
    if (!isUnsaved(draft)) {
      setDraft(emptyDraft);
    }
    setEdit(
      edit?.note && isUnsaved(edit.draft, edit.note)
        ? { note: null, draft: edit.draft }
        : null,
    );
  }

  // A finished change still holds the note's text and the saved note.
  useEffect(() => {
    if (readerId === null) {
      resetCreate();
      resetUpdate();
      resetRemove();
    }
  }, [readerId, resetCreate, resetUpdate, resetRemove]);

  // "Invalid page.": notes deleted elsewhere emptied this page (arch §8.7).
  if (page !== 1 && hasStatus(notes.error, 404)) {
    setPage(1);
  }

  function handleCreate(request: NoteRequest) {
    setNotice(null);
    create.mutate(
      { request, targetPage: 1 },
      {
        onSuccess: () => {
          setDraft(emptyDraft);
          setPage(1);
        },
      },
    );
  }

  function startEdit(note: Note) {
    setNotice(null);
    update.reset();
    setEdit({ note, draft: draftFromNote(note) });
  }

  function handleUpdate(request: NoteRequest) {
    if (edit?.note == null) {
      return;
    }
    setNotice(null);
    update.mutate(
      { id: edit.note.id, request, targetPage: page },
      {
        onSuccess: () => setEdit(null),
        onError: (error) => {
          if (hasStatus(error, 404)) {
            setEdit(null);
            setNotice(NOTE_GONE);
          }
        },
      },
    );
  }

  function handleDelete(note: Note, onlyNoteOnPage: boolean) {
    setNotice(null);
    // Deleting the only note on a later page empties it: go back one.
    const targetPage = onlyNoteOnPage && page > 1 ? page - 1 : page;
    remove.mutate(
      { id: note.id, targetPage },
      {
        onSuccess: () => setPage(targetPage),
        onError: (error) => {
          if (hasStatus(error, 404)) {
            setNotice(NOTE_GONE);
          }
        },
      },
    );
  }

  // Drawn from the section's copy of the note, so a refetch, a page change or
  // a new note can't take an open edit away (arch §8.5).
  const editForm = edit && (
    <NoteForm
      label="Edit note"
      submitLabel="Save"
      draft={edit.draft}
      onDraftChange={(draft) =>
        setEdit((current) => current && { ...current, draft })
      }
      onSave={handleUpdate}
      saving={update.isPending}
      error={update.error}
      savedNote={edit.note ?? undefined}
      onCancel={() => {
        update.reset();
        setEdit(null);
      }}
      expired={user === null}
    />
  );
  const createForm = (
    <NoteForm
      label="Add a note"
      submitLabel="Add note"
      draft={draft}
      onDraftChange={setDraft}
      onSave={handleCreate}
      saving={create.isPending}
      error={create.error}
      onCancel={user === null ? () => setDraft(emptyDraft) : undefined}
      expired={user === null}
    />
  );

  const failedDeleteId =
    remove.isError &&
    !hasStatus(remove.error, 401) &&
    !hasStatus(remove.error, 404)
      ? remove.variables.id
      : undefined;

  let list;
  if (notes.data === undefined) {
    list = notes.isError ? (
      <ErrorState
        message="Your notes couldn't be loaded."
        onRetry={() => void notes.refetch()}
      />
    ) : (
      <LoadingState label="Loading notes…" />
    );
  } else if (notes.data.count === 0) {
    list = (
      <EmptyState message="You haven't written any notes on this book yet." />
    );
  } else {
    const { results } = notes.data;
    list = (
      <>
        <ol className={styles.list}>
          {results.map((note) =>
            note.id === edit?.note?.id ? (
              <li key={note.id} className={styles.editing}>
                {editForm}
              </li>
            ) : (
              <NoteItem
                key={note.id}
                note={note}
                onEdit={() => startEdit(note)}
                canEdit={edit === null}
                onDelete={() => handleDelete(note, results.length === 1)}
                // One delete at a time, so the section knows which one it is.
                canDelete={!remove.isPending}
                deleting={remove.isPending && remove.variables.id === note.id}
                deleteFailed={note.id === failedDeleteId}
              />
            ),
          )}
        </ol>
        <Pagination
          page={page}
          pageCount={Math.ceil(notes.data.count / NOTES_PAGE_SIZE)}
          onPageChange={setPage}
        />
      </>
    );
  }
  const editIsListed =
    notes.data?.results.some((note) => note.id === edit?.note?.id) ?? false;

  // Without a reader, only unsaved drafts show, or else the login link. One
  // layout for both keeps the create form mounted when the session ends.
  const showCreateForm = user !== null || isUnsaved(draft);
  return (
    <section
      className={styles.notes}
      aria-labelledby={user ? headingId : undefined}
      aria-label={user ? undefined : "Your notes"}
    >
      {user && (
        <h2 id={headingId} className={styles.heading}>
          Your notes
        </h2>
      )}
      {showCreateForm && createForm}
      {notice && (
        <p role="alert" className={styles.notice}>
          {notice}
        </p>
      )}
      {!editIsListed && editForm && (
        <div className={styles.editing}>{editForm}</div>
      )}
      {user
        ? list
        : !showCreateForm &&
          !editForm && (
            <p className={styles.prompt}>
              <Link to="/login" state={{ from: location }}>
                Log in to add notes
              </Link>
            </p>
          )}
    </section>
  );
}
