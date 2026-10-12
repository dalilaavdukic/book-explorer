import { Link } from "react-router-dom";
import styles from "./NotFound.module.scss";
import PageTitle from "./PageTitle.tsx";

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
      <PageTitle name={title} />
      <h1 tabIndex={-1}>{title}</h1>
      <p>
        <Link to={to} className={styles.link}>
          {linkLabel}
        </Link>
      </p>
    </section>
  );
}
