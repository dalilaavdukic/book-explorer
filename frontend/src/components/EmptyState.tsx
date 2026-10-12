import type { ReactNode } from "react";
import styles from "./EmptyState.module.scss";

interface EmptyStateProps {
  message: string;
  /** Shown after the message, such as a way out of an empty result. */
  action?: ReactNode;
}

export default function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <p className={styles.empty}>
      {message}
      {action && <> {action}</>}
    </p>
  );
}
