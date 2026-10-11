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

export default function NoteItem({ note }: { note: Note }) {
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
    </li>
  );
}
