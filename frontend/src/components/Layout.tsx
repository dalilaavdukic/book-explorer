import { useEffect } from "react";
import {
  NavigationType,
  Outlet,
  useLocation,
  useNavigationType,
} from "react-router-dom";
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
        <Outlet />
      </main>
    </>
  );
}
