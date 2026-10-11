import { Link } from "react-router-dom";
import { ApiError } from "../api/client.ts";
import EmptyState from "../components/EmptyState.tsx";
import ErrorState from "../components/ErrorState.tsx";
import LoadingState from "../components/LoadingState.tsx";
import NotFound from "../components/NotFound.tsx";
import Pagination from "../components/Pagination.tsx";
import styles from "./BookListPage.module.scss";
import {
  BOOKS_PAGE_SIZE,
  type BookListState,
  useBookListState,
} from "./listState.ts";
import { useBookList } from "./queries.ts";

export default function BookListPage() {
  const { params, setPage, firstPageSearch, listSearch } = useBookListState();

  if (params === "invalid") {
    return <PageNotFound firstPageSearch={firstPageSearch} />;
  }
  return (
    <BookResults
      params={params}
      onPageChange={setPage}
      firstPageSearch={firstPageSearch}
      listSearch={listSearch}
    />
  );
}

interface BookResultsProps {
  params: BookListState;
  onPageChange: (page: number) => void;
  firstPageSearch: string;
  listSearch: string;
}

function BookResults({
  params,
  onPageChange,
  firstPageSearch,
  listSearch,
}: BookResultsProps) {
  const { data, error, isPending, isError, refetch } = useBookList(params);

  if (isError && error instanceof ApiError && error.status === 404) {
    return <PageNotFound firstPageSearch={firstPageSearch} />;
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
    content = <EmptyState message="There are no books in the catalog yet." />;
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
                <Link to={`/books/${book.id}`} state={{ listSearch }}>
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
          onPageChange={onPageChange}
        />
      </>
    );
  }

  return (
    <>
      <h1>Books</h1>
      {content}
    </>
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
