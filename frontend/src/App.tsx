import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.tsx";
import NotFound from "./components/NotFound.tsx";

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<h1>Books</h1>} />
        <Route path="*" element={<NotFound title="Page not found" />} />
      </Route>
    </Routes>
  );
}

export default App;
