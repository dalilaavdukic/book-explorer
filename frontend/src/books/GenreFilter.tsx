import { useEffect, useId, useRef, useState } from "react";
import ErrorState from "../components/ErrorState.tsx";
import { ChevronDownIcon } from "../components/icons.tsx";
import LoadingState from "../components/LoadingState.tsx";
import styles from "./GenreFilter.module.scss";
import { useGenres } from "./queries.ts";

interface GenreFilterProps {
  selected: number[];
  onChange: (genres: number[]) => void;
}

export default function GenreFilter({ selected, onChange }: GenreFilterProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // A click rather than a pointerdown, so a swipe that scrolls the panel on a
  // touch screen doesn't close it. The event's path is checked rather than
  // contains(), because a click inside can re-render and detach its target.
  useEffect(() => {
    const root = rootRef.current;
    if (!open || root === null) {
      return;
    }
    const closeOnClickOutside = (event: MouseEvent) => {
      if (!event.composedPath().includes(root)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", closeOnClickOutside);
    return () => document.removeEventListener("click", closeOnClickOutside);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={styles.genreFilter}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          buttonRef.current?.focus();
        }
      }}
      onBlur={(event) => {
        // Focus moving to nothing, as a click on the panel's legend or padding
        // does, keeps it open.
        const next = event.relatedTarget;
        if (next !== null && !event.currentTarget.contains(next)) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        className={styles.toggle}
        onClick={() => setOpen(!open)}
      >
        {selected.length > 0 ? `Genres (${selected.length})` : "Genres"}
        <ChevronDownIcon className={styles.chevron} />
      </button>
      <div id={panelId} className={styles.panel} hidden={!open}>
        {/* Mounted only while open, so the list isn't fetched until needed. */}
        {open && <GenreOptions selected={selected} onChange={onChange} />}
      </div>
    </div>
  );
}

function GenreOptions({ selected, onChange }: GenreFilterProps) {
  const { data: genres, isPending, isError, refetch } = useGenres();

  if (isPending) {
    return <LoadingState label="Loading genres…" />;
  }
  if (isError) {
    return (
      <ErrorState
        message="Genres couldn't be loaded."
        onRetry={() => void refetch()}
      />
    );
  }
  return (
    <fieldset className={styles.options}>
      <legend className={styles.legend}>Genres</legend>
      {genres.map((genre) => (
        <label key={genre.id} className={styles.option}>
          <input
            type="checkbox"
            checked={selected.includes(genre.id)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selected, genre.id]
                  : selected.filter((id) => id !== genre.id),
              )
            }
          />
          {genre.name}
        </label>
      ))}
    </fieldset>
  );
}
