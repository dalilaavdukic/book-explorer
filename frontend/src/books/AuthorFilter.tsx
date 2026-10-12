import { useQueryClient } from "@tanstack/react-query";
import { type KeyboardEvent, useId, useRef, useState } from "react";
import type { Author } from "../api/authors.ts";
import { CloseIcon } from "../components/icons.tsx";
import styles from "./AuthorFilter.module.scss";
import { authorKeys, useAuthor, useAuthorSuggestions } from "./queries.ts";
import { useDebouncedValue } from "./useDebouncedValue.ts";

const PAUSE_MS = 300;

interface AuthorFilterProps {
  /** The URL's author. */
  author: number | null;
  onChange: (author: number | null) => void;
}

/**
 * A combobox following the WAI-ARIA pattern. Only the chosen author's id goes
 * into the URL; the typed text never does (arch §8.7).
 */
export default function AuthorFilter({ author, onChange }: AuthorFilterProps) {
  const client = useQueryClient();
  const { data: chosen } = useAuthor(author);
  // null shows the chosen author's name.
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [seenAuthor, setSeenAuthor] = useState(author);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const listId = `${id}-list`;

  // Back, Forward and Clear all change the author without the selector.
  if (author !== seenAuthor) {
    setSeenAuthor(author);
    setText(null);
    setOpen(false);
    setActive(-1);
  }

  const shownText = text ?? chosen?.name ?? "";
  const search = shownText.trim();
  const debouncedSearch = useDebouncedValue(search, PAUSE_MS);
  const typing = debouncedSearch !== search;
  const suggestions = useAuthorSuggestions(debouncedSearch, open && !typing);
  const options = open && !typing ? (suggestions.data ?? []) : [];

  let status = "";
  if (open) {
    if (typing || suggestions.isPending) {
      status = "Searching authors…";
    } else if (suggestions.isError) {
      status = "Authors couldn't be loaded.";
    } else if (options.length === 0) {
      status = "No authors match.";
    }
  }

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const choose = (option: Author) => {
    client.setQueryData(authorKeys.detail(option.id), option);
    setText(option.name);
    close();
    if (option.id !== author) {
      onChange(option.id);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const count = options.length;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) {
          setOpen(true);
        } else if (count > 0) {
          setActive((active + 1) % count);
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (open && count > 0) {
          setActive(active <= 0 ? count - 1 : active - 1);
        }
        break;
      case "Enter":
        if (open && options[active] !== undefined) {
          event.preventDefault();
          choose(options[active]);
        }
        break;
      case "Escape":
        if (open) {
          close();
        } else {
          setText(null);
        }
        break;
    }
  };

  const optionId = (option: Author) => `${id}-${option.id}`;
  const activeOption = options[active];

  return (
    <div className={styles.authorFilter}>
      <label className={styles.label} htmlFor={`${id}-input`}>
        Author
      </label>
      <div className={styles.field}>
        <input
          ref={inputRef}
          id={`${id}-input`}
          type="text"
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeOption === undefined ? undefined : optionId(activeOption)
          }
          autoComplete="off"
          maxLength={100}
          placeholder="Any author"
          value={shownText}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            close();
            setText(null);
          }}
        />
        {author !== null && (
          <button
            type="button"
            aria-label="Clear author"
            className={styles.clear}
            onClick={() => {
              setText(null);
              onChange(null);
              // This button goes away with the author.
              inputRef.current?.focus();
            }}
          >
            <CloseIcon />
          </button>
        )}
      </div>
      <ul
        id={listId}
        role="listbox"
        aria-label="Authors"
        className={styles.options}
        hidden={options.length === 0}
      >
        {options.map((option, index) => (
          <li
            key={option.id}
            id={optionId(option)}
            role="option"
            aria-selected={index === active}
            className={styles.option}
            // Keeps focus in the input, whose blur would close the list
            // before the click lands.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(option)}
          >
            {option.name}
          </li>
        ))}
      </ul>
      <p role="status" className={styles.status}>
        {status}
      </p>
    </div>
  );
}
