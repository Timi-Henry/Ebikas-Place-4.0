import Link from "next/link";
import { StoreEffects } from "@/components/store-effects";

const categoryLinks = [
  { href: "/shop?family=clothing&audience=women", label: "Women" },
  { href: "/shop?family=clothing&audience=men", label: "Men" },
  { href: "/shop?audience=kids", label: "Kids" },
  { href: "/shop?family=footwear", label: "Shoes" }
];

export default function NotFound() {
  return (
    <main className="store-state-page" id="main-content" tabIndex={-1}>
      <StoreEffects />
      <Link className="store-state-brand" href="/" aria-label="Ebika's Place home">
        <span aria-hidden="true">E</span>
        <strong>Ebika’s Place</strong>
      </Link>
      <section className="store-state-card" aria-labelledby="not-found-title">
        <span className="store-state-code">404 · Page not found</span>
        <h1 id="not-found-title">We couldn’t find that page.</h1>
        <p>The link may be out of date, or the product may no longer be available. Search the current collection or choose a category below.</p>
        <form className="store-state-search" action="/shop" method="get">
          <label htmlFor="not-found-search">Search the shop</label>
          <div>
            <input id="not-found-search" name="search" type="search" placeholder="Try dresses, shoes, bags…" />
            <button type="submit">Search</button>
          </div>
        </form>
        <nav className="store-state-links" aria-label="Popular categories">
          {categoryLinks.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}
        </nav>
        <Link className="store-state-home" href="/">Return home</Link>
      </section>
    </main>
  );
}
