import { type FormEvent, useId, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ApiError } from "../api/client.ts";
import type { Note, NoteRequest } from "../api/notes.ts";
import styles from "./NoteForm.module.scss";
import { isUnsaved, type NoteDraft, parsePage } from "./noteDraft.ts";

const MAX_BODY_LENGTH = 5000;
const SAVE_FAILED = "Couldn't save the note. Please try again.";

interface NoteFormProps {
  /** The form's accessible name. */
  label: string;
  submitLabel: string;
  draft: NoteDraft;
  onDraftChange: (draft: NoteDraft) => void;
  onSave: (request: NoteRequest) => void;
  saving: boolean;
  /** Why the last save failed, if it did. */
  error: Error | null;
  /** The note being edited: Save stays disabled until something changes. */
  savedNote?: Note;
  onCancel?: () => void;
  /** The session ended before the draft was saved: it can't be saved now. */
  expired?: boolean;
}

export default function NoteForm({
  label,
  submitLabel,
  draft,
  onDraftChange,
  onSave,
  saving,
  error,
  savedNote,
  onCancel,
  expired = false,
}: NoteFormProps) {
  const id = useId();
  const location = useLocation();
  const [pageInvalid, setPageInvalid] = useState(false);
  const errors = saveErrors(error);
  const pageError = pageInvalid
    ? "Enter a whole number from 1 to 10,000."
    : errors.page;
  const canSave =
    !expired &&
    !saving &&
    draft.body.trim() !== "" &&
    isUnsaved(draft, savedNote);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) {
      return;
    }
    const page = parsePage(draft.page);
    if (page === undefined) {
      setPageInvalid(true);
      return;
    }
    onSave({ body: draft.body, page });
  }

  return (
    <form
      aria-label={label}
      className={styles.form}
      onSubmit={handleSubmit}
      noValidate
    >
      <div className={styles.field}>
        <label htmlFor={`${id}-body`}>Note</label>
        <textarea
          id={`${id}-body`}
          name="body"
          rows={4}
          // Never looser than the server: it counts UTF-16 code units and
          // surrounding whitespace, which the server trims first.
          maxLength={MAX_BODY_LENGTH}
          value={draft.body}
          onChange={(event) =>
            onDraftChange({ ...draft, body: event.target.value })
          }
          aria-invalid={errors.body !== undefined}
          aria-describedby={errors.body ? `${id}-body-error` : undefined}
        />
        {errors.body && (
          <p id={`${id}-body-error`} className={styles.error}>
            {errors.body}
          </p>
        )}
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-page`}>Page (optional)</label>
        <input
          id={`${id}-page`}
          name="page"
          // Text, not a number input, which would turn "abc" into an empty
          // value and save the note without its page.
          inputMode="numeric"
          autoComplete="off"
          className={styles.page}
          value={draft.page}
          onChange={(event) => {
            setPageInvalid(false);
            onDraftChange({ ...draft, page: event.target.value });
          }}
          aria-invalid={pageError !== undefined}
          aria-describedby={pageError ? `${id}-page-error` : undefined}
        />
        {pageError && (
          <p id={`${id}-page-error`} className={styles.error}>
            {pageError}
          </p>
        )}
      </div>
      {errors.form && (
        <p role="alert" className={styles.error}>
          {errors.form}
        </p>
      )}
      {expired && (
        // Logging in again discards the draft (spec §6), hence the advice to
        // copy it first.
        <p role="alert" className={styles.error}>
          Your session has expired, and this note isn't saved. Copy anything you
          want to keep, then log in again.{" "}
          <Link to="/login" state={{ from: location }}>
            Log in again
          </Link>
        </p>
      )}
      <div className={styles.actions}>
        <button type="submit" className={styles.submit} disabled={!canSave}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

interface SaveErrors {
  body?: string;
  page?: string;
  form?: string;
}

function saveErrors(error: Error | null): SaveErrors {
  if (error === null) {
    return {};
  }
  // A 401 logs the reader out, and the section says the session expired.
  if (error instanceof ApiError && error.status === 401) {
    return {};
  }
  if (
    !(error instanceof ApiError) ||
    error.status !== 400 ||
    typeof error.body !== "object" ||
    error.body === null
  ) {
    return { form: SAVE_FAILED };
  }
  const { body, page, ...rest } = error.body as Record<string, unknown>;
  const errors = {
    body: messages(body),
    page: messages(page),
    form: messages(Object.values(rest)),
  };
  return errors.body || errors.page || errors.form
    ? errors
    : { form: SAVE_FAILED };
}

/** DRF's messages for a field: a string, or lists of them. */
function messages(value: unknown) {
  const texts = [value]
    .flat(2)
    .filter((text): text is string => typeof text === "string");
  return texts.length > 0 ? texts.join(" ") : undefined;
}
