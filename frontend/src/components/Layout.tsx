import { useEffect, useRef } from "react";
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
  const { key, pathname } = useLocation();
  const navigationType = useNavigationType();
  const mainRef = useRef<HTMLElement>(null);
  const shownPathname = useRef(pathname);

  // A new page starts at the top. Back and forward keep the browser's own
  // scroll restoration.
  useEffect(() => {
    if (navigationType === NavigationType.Push) {
      window.scrollTo(0, 0);
    }
  }, [key, navigationType]);

  // A new page moves focus to its heading, so a screen reader announces it.
  // The first page doesn't, and neither does a change to the search alone
  // (filters, sort, page), which would pull focus from the control in use.
  useEffect(() => {
    if (pathname === shownPathname.current) {
      return;
    }
    shownPathname.current = pathname;
    return focusHeadingOnceShown(mainRef.current);
  }, [pathname]);

  return (
    <>
      <Header />
      <main ref={mainRef} className={styles.main}>
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

// A page that is still loading gets its heading later. Focus moves without
// scrolling: a new page is already at the top, and Back and Forward rely on
// the browser restoring the scroll position.
function focusHeadingOnceShown(main: HTMLElement | null) {
  if (main === null) {
    return;
  }
  const focusedBefore = document.activeElement;
  const focusHeading = () => {
    const heading = main.querySelector("h1");
    if (heading === null) {
      return false;
    }
    // Unless the reader has moved focus themselves while the page loaded.
    const focused = document.activeElement;
    if (focused === focusedBefore || focused === document.body) {
      heading.focus({ preventScroll: true });
    }
    return true;
  };
  if (focusHeading()) {
    return;
  }
  const observer = new MutationObserver(() => {
    if (focusHeading()) {
      observer.disconnect();
    }
  });
  observer.observe(main, { childList: true, subtree: true });
  return () => observer.disconnect();
}
