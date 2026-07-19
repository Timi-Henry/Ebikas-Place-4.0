"use client";

import Link from "next/link";
import { StoreEffects } from "@/components/store-effects";
import { BrandMark } from "@/components/brand-mark";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="store-state-page" id="main-content" tabIndex={-1}>
      <StoreEffects />
      <Link className="store-state-brand" href="/" aria-label="Ebika's Place home">
        <BrandMark />
        <strong>Ebika’s Place</strong>
      </Link>
      <section className="store-state-card" aria-labelledby="error-title">
        <span className="store-state-code">Something interrupted your visit</span>
        <h1 id="error-title">This page couldn’t load.</h1>
        <p>Try the page again. If the problem continues, return to the shop and keep browsing the current collection.</p>
        <div className="store-state-actions">
          <button className="btn-primary" type="button" onClick={reset}>Try again</button>
          <Link className="btn-ghost" href="/shop">Browse the shop</Link>
        </div>
      </section>
    </main>
  );
}
