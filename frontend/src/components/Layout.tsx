import { useEffect } from "react";
import {
  Link,
  NavigationType,
  Outlet,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import ErrorBoundary from "./ErrorBoundary.tsx";
import ErrorFallback from "./ErrorFallback.tsx";
import Header from "./Header.tsx";
import styles from "./Layout.module.scss";

export default function Layout() {
  const { key } = useLocation();
  const navigationType = useNavigationType();

  // A new page starts at the top. Back and forward keep the browser's own
  // scroll restoration.
  useEffect(() => {
    if (navigationType === NavigationType.Push) {
      window.scrollTo(0, 0);
    }
  }, [key, navigationType]);

  return (
    <>
      <Header />
      <main className={styles.main}>
        {/* The header stays usable, and any navigation clears the error. */}
        <ErrorBoundary
          resetKey={key}
          fallback={
            <ErrorFallback
              message="Something went wrong on this page."
              homeLink={<Link to="/">Back to the catalog</Link>}
            />
          }
        >
          <Outlet />
        </ErrorBoundary>
      </main>
    </>
  );
}
