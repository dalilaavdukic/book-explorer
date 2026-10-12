import type { Ref } from "react";
import { useAuth } from "../auth/session.ts";
import AuthorFilter from "./AuthorFilter.tsx";
import styles from "./BookFilters.module.scss";
import GenreFilter from "./GenreFilter.tsx";
import {
  BOOK_SORT_LABELS,
  type BookListState,
  type BookListUrl,
  type BookSort,
} from "./listState.ts";
import SearchBox from "./SearchBox.tsx";

interface BookFiltersProps {
  params: BookListState;
  listUrl: BookListUrl;
  /** Changing it starts the search box afresh, dropping any unsaved text. */
  searchBoxKey: number;
  searchBoxRef: Ref<HTMLInputElement>;
  onClearAll: () => void;
}

export default function BookFilters({
  params,
  listUrl,
  searchBoxKey,
  searchBoxRef,
  onClearAll,
}: BookFiltersProps) {
  const { user } = useAuth();
  const filtered =
    params.search !== "" ||
    params.author !== null ||
    params.genre.length > 0 ||
    params.has_notes;

  return (
    <div role="search" aria-label="Find books" className={styles.filters}>
      <SearchBox
        key={searchBoxKey}
        ref={searchBoxRef}
        search={params.search}
        onSearch={listUrl.setSearch}
      />
      <AuthorFilter author={params.author} onChange={listUrl.setAuthor} />
      <GenreFilter selected={params.genre} onChange={listUrl.setGenres} />
      <label>
        Sort by
        <select
          value={params.sort}
          onChange={(event) =>
            // The options are the labels' keys, so the value is a BookSort.
            listUrl.setSort(event.target.value as BookSort)
          }
        >
          {Object.entries(BOOK_SORT_LABELS).map(([sort, label]) => (
            <option key={sort} value={sort}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {user !== null && (
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={params.has_notes}
            onChange={(event) => listUrl.setHasNotes(event.target.checked)}
          />
          Books with my notes
        </label>
      )}
      {filtered && (
        <button type="button" className={styles.clearAll} onClick={onClearAll}>
          Clear all
        </button>
      )}
    </div>
  );
}
