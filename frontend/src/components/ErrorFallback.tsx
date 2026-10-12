import type { ReactNode } from "react";
import styles from "./ErrorFallback.module.scss";

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
