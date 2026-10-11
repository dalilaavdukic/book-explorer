import { useId, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ApiError } from "../api/client.ts";
import type { NoteRequest } from "../api/notes.ts";
import { useAuth, useDraftsVersion } from "../auth/session.ts";
import EmptyState from "../components/EmptyState.tsx";
import ErrorState from "../components/ErrorState.tsx";
import LoadingState from "../components/LoadingState.tsx";
import Pagination from "../components/Pagination.tsx";
import NoteForm from "./NoteForm.tsx";
import NoteItem from "./NoteItem.tsx";
import { emptyDraft } from "./noteDraft.ts";
import styles from "./NotesSection.module.scss";
import { NOTES_PAGE_SIZE, useCreateNote, useNotes } from "./queries.ts";

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
  const notes = useNotes(user, bookId, page);
  const create = useCreateNote(bookId);

  // "Invalid page.": notes deleted elsewhere emptied this page (arch §8.7).
  if (
    page !== 1 &&
    notes.error instanceof ApiError &&
    notes.error.status === 404
  ) {
    setPage(1);
  }

  if (user === null) {
    return (
      <section className={styles.notes} aria-label="Your notes">
        <p>
          <Link to="/login" state={{ from: location }}>
            Log in to add notes
          </Link>
        </p>
      </section>
    );
  }

  function handleCreate(request: NoteRequest) {
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
    list = (
      <>
        <ol className={styles.list}>
          {notes.data.results.map((note) => (
            <NoteItem key={note.id} note={note} />
          ))}
        </ol>
        <Pagination
          page={page}
          pageCount={Math.ceil(notes.data.count / NOTES_PAGE_SIZE)}
          onPageChange={setPage}
        />
      </>
    );
  }

  return (
    <section className={styles.notes} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.heading}>
        Your notes
      </h2>
      <NoteForm
        label="Add a note"
        submitLabel="Add note"
        draft={draft}
        onDraftChange={setDraft}
        onSave={handleCreate}
        saving={create.isPending}
        error={create.error}
      />
      {list}
    </section>
  );
}
