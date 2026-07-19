export function CatalogUnavailableNotice({
  framed = false,
  title = "Products are temporarily unavailable.",
  message = "We could not load the live catalog. Please refresh in a moment or contact the store if you need help ordering."
}: {
  framed?: boolean;
  title?: string;
  message?: string;
}) {
  const notice = (
    <p className="notice" role="status" aria-live="polite">
      <strong>{title}</strong>{" "}
      {message}
    </p>
  );

  return framed ? <section className="section-frame">{notice}</section> : notice;
}
