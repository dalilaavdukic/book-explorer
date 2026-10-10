import { Route, Routes } from "react-router-dom";
import styles from "./App.module.scss";

function App() {
  return (
    <main className={styles.shell}>
      <Routes>
        <Route path="/" element={<h1>Book Explorer</h1>} />
      </Routes>
    </main>
  );
}

export default App;
