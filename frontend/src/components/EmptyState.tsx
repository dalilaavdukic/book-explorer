import styles from "./EmptyState.module.scss";

interface EmptyStateProps {
  message: string;
}

export default function EmptyState({ message }: EmptyStateProps) {
  return <p className={styles.empty}>{message}</p>;
}
