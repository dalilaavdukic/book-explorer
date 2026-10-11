import { Route, Routes } from "react-router-dom";
import BookDetailPage from "./books/BookDetailPage.tsx";
import BookListPage from "./books/BookListPage.tsx";
import Layout from "./components/Layout.tsx";
import NotFound from "./components/NotFound.tsx";

function App() {
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
