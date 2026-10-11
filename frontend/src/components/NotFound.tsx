import { Link } from "react-router-dom";
import styles from "./NotFound.module.scss";

interface NotFoundProps {
  title: string;
  to?: string;
  linkLabel?: string;
}

export default function NotFound({
  title,
  to = "/",
  linkLabel = "Back to the catalog",
}: NotFoundProps) {
  return (
    <section className={styles.notFound}>
      <h1>{title}</h1>
      <p>
        <Link to={to}>{linkLabel}</Link>
      </p>
    </section>
  );
}
