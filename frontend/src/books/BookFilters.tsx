import type { Ref } from "react";
import { useAuth } from "../auth/session.ts";
import { ArrowDownIcon, ArrowUpIcon } from "../components/icons.tsx";
import AuthorFilter from "./AuthorFilter.tsx";
import styles from "./BookFilters.module.scss";
import GenreFilter from "./GenreFilter.tsx";
import {
  BOOK_SORT_FIELDS,
  type BookListState,
  type BookListUrl,
  type BookSortField,
  joinSort,
  splitSort,
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
  const { field, descending } = splitSort(params.sort);

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
      <div className={styles.sort}>
        <label className={styles.sortField}>
          Sort by
          <select
            value={field}
            onChange={(event) =>
              listUrl.setSort(
                // The options are the fields' keys.
                joinSort(event.target.value as BookSortField, descending),
              )
            }
          >
            {Object.entries(BOOK_SORT_FIELDS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          aria-label={descending ? "Descending" : "Ascending"}
          className={styles.direction}
          onClick={() => listUrl.setSort(joinSort(field, !descending))}
        >
          {descending ? <ArrowDownIcon /> : <ArrowUpIcon />}
        </button>
      </div>
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
