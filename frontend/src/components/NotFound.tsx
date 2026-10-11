import { Link } from "react-router-dom";
import styles from "./NotFound.module.scss";

interface NotFoundProps {
  title: string;
}

export default function NotFound({ title }: NotFoundProps) {
  return (
    <section className={styles.notFound}>
      <h1>{title}</h1>
      <p>
        <Link to="/">Back to the catalog</Link>
      </p>
    </section>
  );
}
