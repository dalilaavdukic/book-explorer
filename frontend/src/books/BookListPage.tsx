import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client.ts";
import EmptyState from "../components/EmptyState.tsx";
import ErrorState from "../components/ErrorState.tsx";
import LoadingState from "../components/LoadingState.tsx";
import NotFound from "../components/NotFound.tsx";
import Pagination from "../components/Pagination.tsx";
import BookFilters from "./BookFilters.tsx";
import styles from "./BookListPage.module.scss";
import {
  BOOKS_PAGE_SIZE,
  type BookListState,
  type BookListUrl,
  useBookListState,
} from "./listState.ts";
import { useBookList } from "./queries.ts";

export default function BookListPage() {
  const listUrl = useBookListState();
  const { params } = listUrl;

  if (params === "invalid-filters") {
    return <InvalidFilters />;
  }
  if (params === "invalid-page") {
    return <PageNotFound firstPageSearch={listUrl.firstPageSearch} />;
  }
  return <BookResults params={params} listUrl={listUrl} />;
}

interface BookResultsProps {
  params: BookListState;
  listUrl: BookListUrl;
}

function BookResults({ params, listUrl }: BookResultsProps) {
  const { data, error, isPending, isError, refetch } = useBookList(params);
  const [searchBoxKey, setSearchBoxKey] = useState(0);
  const searchBoxRef = useRef<HTMLInputElement>(null);

  // Also empties the search box and cancels its pending write, even when the
  // URL has no search yet.
  const clearAll = () => {
    listUrl.clearAll();
    setSearchBoxKey((key) => key + 1);
  };

  // Clear all buttons go away once nothing is filtered, so focus moves to the
  // new search box rather than falling to the page.
  useEffect(() => {
    if (searchBoxKey > 0) {
      searchBoxRef.current?.focus();
    }
  }, [searchBoxKey]);

  if (isError && error instanceof ApiError) {
    if (error.status === 400) {
      return <InvalidFilters />;
    }
    if (error.status === 404) {
      return <PageNotFound firstPageSearch={listUrl.firstPageSearch} />;
    }
  }

  let content;
  if (isPending) {
    content = <LoadingState label="Loading books…" />;
  } else if (isError) {
    content = (
      <ErrorState
        message="The books couldn't be loaded."
        onRetry={() => void refetch()}
      />
    );
  } else if (data.count === 0) {
    content = <NoResults params={params} onClearAll={clearAll} />;
  } else {
    content = (
      <>
        <p className={styles.total}>
          {data.count === 1 ? "1 book" : `${data.count} books`}
        </p>
        <ul className={styles.list}>
          {data.results.map((book) => (
            <li key={book.id} className={styles.item}>
              <h2 className={styles.title}>
                <Link
                  to={`/books/${book.id}`}
                  state={{ listSearch: listUrl.listSearch }}
                >
                  {book.title}
                </Link>
              </h2>
              <p className={styles.meta}>
                {book.author.name} · {book.publication_year}
              </p>
              <p className={styles.genre}>{book.genre.name}</p>
            </li>
          ))}
        </ul>
        <Pagination
          page={params.page}
          pageCount={Math.ceil(data.count / BOOKS_PAGE_SIZE)}
          onPageChange={listUrl.setPage}
        />
      </>
    );
  }

  return (
    <>
      <h1>Books</h1>
      <BookFilters
        params={params}
        listUrl={listUrl}
        searchBoxKey={searchBoxKey}
        searchBoxRef={searchBoxRef}
        onClearAll={clearAll}
      />
      {content}
    </>
  );
}

interface NoResultsProps {
  params: BookListState;
  onClearAll: () => void;
}

function NoResults({ params, onClearAll }: NoResultsProps) {
  const searchesOrFilters =
    params.search !== "" || params.author !== null || params.genre.length > 0;

  if (!searchesOrFilters && !params.has_notes) {
    return <EmptyState message="There are no books in the catalog yet." />;
  }
  return (
    <EmptyState
      message={
        searchesOrFilters
          ? "No books match your search and filters."
          : "You haven't written notes on any book yet. Open a book to add one."
      }
      action={
        <button type="button" onClick={onClearAll}>
          Clear all
        </button>
      }
    />
  );
}

// The bad value might be the sort, which Clear all on the list keeps, so this
// one starts over from the plain catalog.
function InvalidFilters() {
  return (
    <NotFound
      title="This link contains invalid filters"
      to="/"
      linkLabel="Clear all"
    />
  );
}

function PageNotFound({ firstPageSearch }: { firstPageSearch: string }) {
  return (
    <NotFound
      title="This page doesn't exist"
      to={`/${firstPageSearch}`}
      linkLabel="Go to the first page"
    />
  );
}
