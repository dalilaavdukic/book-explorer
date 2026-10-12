import { useEffect, useEffectEvent, useState } from "react";

const PAUSE_MS = 300;

interface SearchBoxProps {
  /** The URL's search. */
  search: string;
  onSearch: (search: string) => void;
}

interface Box {
  text: string;
  /** A write is due once typing pauses. */
  pending: boolean;
  /** The URL's search when the box last rendered. */
  seen: string;
  /** The search this box last wrote, to tell its own writes from others. */
  written: string | null;
}

/**
 * The text being typed is the one copy of list state outside the URL
 * (arch §8.7). It's written after a pause, and replaced whenever the URL's
 * search changes for another reason (Back, Forward, a link).
 */
export default function SearchBox({ search, onSearch }: SearchBoxProps) {
  const [box, setBox] = useState<Box>({
    text: search,
    pending: false,
    seen: search,
    written: null,
  });

  if (search !== box.seen) {
    setBox(
      search === box.written
        ? { ...box, seen: search }
        : { text: search, pending: false, seen: search, written: null },
    );
  }

  // Runs with the latest props, so a filter changed during the pause is kept:
  // a setter from an earlier render would write over it.
  const write = useEffectEvent((text: string) => {
    const next = text.trim();
    setBox((current) => ({ ...current, pending: false, written: next }));
    if (next !== search) {
      onSearch(next);
    }
  });

  // Restarted by every change, and cancelled by a reset or unmounting.
  useEffect(() => {
    if (!box.pending) {
      return;
    }
    const timer = setTimeout(() => write(box.text), PAUSE_MS);
    return () => clearTimeout(timer);
  }, [box.pending, box.text]);

  return (
    <label>
      Search
      <input
        type="search"
        value={box.text}
        maxLength={100}
        placeholder="Title or author"
        onChange={(event) => {
          const text = event.target.value;
          setBox((current) => ({ ...current, text, pending: true }));
        }}
      />
    </label>
  );
}
