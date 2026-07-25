import { BrandMark } from "@/components/brand-mark";
import { businessInfo } from "@/lib/business-info";

export default function Loading() {
  return (
    <main className="store-state-page store-loading-page" id="main-content" tabIndex={-1} aria-busy="true" aria-live="polite">
      <section className="store-loading-card">
        <span className="sr-only">Loading Ebika’s Place</span>
        <div className="store-loading-identity">
          <BrandMark />
          <span>
            <strong>Ebika’s Place</strong>
            <small>{businessInfo.tagline}</small>
          </span>
        </div>
        <div className="store-loading-message">
          <strong>Preparing your next look</strong>
          <small>Loading the page and its latest products.</small>
        </div>
        <div className="store-loading-progress" aria-hidden="true"><span /></div>
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
