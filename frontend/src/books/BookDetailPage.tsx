import { Link, useLocation, useParams } from "react-router-dom";
import { ApiError } from "../api/client.ts";
import ErrorState from "../components/ErrorState.tsx";
import LoadingState from "../components/LoadingState.tsx";
import NotFound from "../components/NotFound.tsx";
import styles from "./BookDetailPage.module.scss";
import { parsePositiveInteger } from "./parsePositiveInteger.ts";
import { useBook } from "./queries.ts";

export default function BookDetailPage() {
  const { id = "" } = useParams();
  const bookId = parsePositiveInteger(id);

  if (bookId === null) {
    return <NotFound title="Book not found" />;
  }
  return <BookDetail id={bookId} />;
}

function BookDetail({ id }: { id: number }) {
  const { data: book, error, isPending, isError, refetch } = useBook(id);
  const listSearch = useListSearch();

  if (isError && error instanceof ApiError && error.status === 404) {
    return <NotFound title="Book not found" />;
  }

  let content;
  if (isPending) {
    content = <LoadingState label="Loading book…" />;
  } else if (isError) {
    content = (
      <ErrorState
        message="The book couldn't be loaded."
        onRetry={() => void refetch()}
      />
    );
  } else {
    content = (
      <article className={styles.book}>
        <h1 className={styles.title}>{book.title}</h1>
        <p className={styles.author}>by {book.author.name}</p>
        <dl className={styles.facts}>
          <div>
            <dt>Published</dt>
            <dd>{book.publication_year}</dd>
          </div>
          <div>
            <dt>Genre</dt>
            <dd>{book.genre.name}</dd>
          </div>
        </dl>
        <p className={styles.description}>{book.description}</p>
      </article>
    );
  }

  return (
    <>
      <p className={styles.back}>
        <Link to={{ pathname: "/", search: listSearch }}>Back to books</Link>
      </p>
      {content}
    </>
  );
}

// The list links pass their search string as router state, so "Back to books"
// returns to the same page. Opened directly, there's none: go to the first page.
function useListSearch() {
  const state: unknown = useLocation().state;
  const listSearch =
    typeof state === "object" && state !== null && "listSearch" in state
      ? state.listSearch
      : undefined;
  return typeof listSearch === "string" ? listSearch : "";
}
