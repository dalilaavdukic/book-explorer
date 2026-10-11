import styles from "./LoadingState.module.scss";

interface LoadingStateProps {
  label?: string;
}

export default function LoadingState({
  label = "Loading…",
}: LoadingStateProps) {
  return (
    <p role="status" className={styles.loading}>
      {label}
    </p>
  );
}
