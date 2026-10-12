import type { ReactNode } from "react";
import styles from "./ErrorFallback.module.scss";
import PageTitle from "./PageTitle.tsx";

interface ErrorFallbackProps {
  message: string;
  /** A link back to the catalog that still works where this is shown. */
  homeLink: ReactNode;
}

export default function ErrorFallback({
  message,
  homeLink,
}: ErrorFallbackProps) {
  return (
    <div role="alert" className={styles.error}>
      <PageTitle name="Something went wrong" />
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
        {homeLink}
      </div>
    </div>
  );
}
