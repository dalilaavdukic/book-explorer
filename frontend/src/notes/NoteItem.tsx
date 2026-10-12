import { useId, useRef } from "react";
import type { Note } from "../api/notes.ts";
import styles from "./NoteItem.module.scss";

// In the reader's own locale and time zone (arch §7.2).
const timeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function Time({ value }: { value: string }) {
  return <time dateTime={value}>{timeFormat.format(new Date(value))}</time>;
}

interface NoteItemProps {
  note: Note;
  onEdit: () => void;
  canEdit: boolean;
  onDelete: () => void;
  canDelete: boolean;
  deleting: boolean;
  deleteFailed: boolean;
}

export default function NoteItem({
  note,
  onEdit,
  canEdit,
  onDelete,
  canDelete,
  deleting,
  deleteFailed,
}: NoteItemProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const page = note.page ?? null;

  return (
    <li className={styles.note}>
      <p className={styles.body}>{note.body}</p>
      <p className={styles.meta}>
        {page !== null && <span>p. {page}</span>}
        <Time value={note.created_at} />
        {note.edited_at !== null && (
          <span>
            Edited <Time value={note.edited_at} />
          </span>
        )}
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.edit}
          onClick={onEdit}
          disabled={!canEdit || deleting}
        >
          Edit
        </button>
        <button
          type="button"
          className={styles.delete}
          onClick={() => dialog.current?.showModal()}
          disabled={!canDelete || deleting}
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
      {deleteFailed && (
        <p role="alert" className={styles.error}>
          Couldn't delete the note. Please try again.
        </p>
      )}
      <dialog ref={dialog} aria-labelledby={titleId} className={styles.dialog}>
        <h3 id={titleId} className={styles.dialogTitle}>
          Delete this note?
        </h3>
        <p>This can't be undone.</p>
        <div className={styles.actions}>
          <button type="button" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.confirmDelete}
            onClick={() => {
              dialog.current?.close();
              onDelete();
            }}
          >
            Delete
          </button>
        </div>
      </dialog>
    </li>
  );
}
