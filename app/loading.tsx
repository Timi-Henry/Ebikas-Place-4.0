import { BrandMark } from "@/components/brand-mark";

export default function Loading() {
  return (
    <main className="store-state-page store-loading-page" id="main-content" tabIndex={-1} aria-busy="true" aria-live="polite">
      <div className="store-state-brand" aria-hidden="true">
        <BrandMark />
        <strong>Ebika’s Place</strong>
      </div>
      <section className="store-loading-card">
        <span className="sr-only">Loading the store</span>
        <div className="store-loading-kicker" />
        <div className="store-loading-title" />
        <div className="store-loading-copy" />
        <div className="store-loading-copy store-loading-copy-short" />
        <div className="store-loading-products">
          <span />
          <span />
          <span />
        </div>
      </section>
    </main>
  );
}
