interface PageTitleProps {
  name: string;
}

/** The document's title. React moves it into the head, ahead of index.html's. */
export default function PageTitle({ name }: PageTitleProps) {
  return <title>{`${name} — Book Explorer`}</title>;
}
