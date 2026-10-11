import { useQuery } from "@tanstack/react-query";
import { Route, Routes } from "react-router-dom";
import { sessionQuery } from "./auth/session.ts";
import BookDetailPage from "./books/BookDetailPage.tsx";
import BookListPage from "./books/BookListPage.tsx";
import ErrorState from "./components/ErrorState.tsx";
import Layout from "./components/Layout.tsx";
import layoutStyles from "./components/Layout.module.scss";
import LoadingState from "./components/LoadingState.tsx";
import NotFound from "./components/NotFound.tsx";

function App() {
  const { data: user, isError, refetch } = useQuery(sessionQuery);

  // Nothing renders until the session is known, so no page or header ever
  // shows a logged-out view to a reader who is logged in.
  if (user === undefined) {
    return (
      <main className={layoutStyles.main}>
        {isError ? (
          <ErrorState
            message="Book Explorer couldn't be loaded."
            onRetry={() => void refetch()}
          />
        ) : (
          <LoadingState />
        )}
      </main>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<BookListPage />} />
        <Route path="books/:id" element={<BookDetailPage />} />
        <Route path="*" element={<NotFound title="Page not found" />} />
      </Route>
    </Routes>
  );
}

export default App;
