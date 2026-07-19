import Link from "next/link";
import { CatalogUnavailableNotice } from "@/components/catalog-unavailable-notice";
import { ChevronRight, ShieldCheck, Truck } from "lucide-react";
import { Footer } from "@/components/footer";
import { Nav } from "@/components/nav";
import { ProductBrowser } from "@/components/product-browser";
import { StoreEffects } from "@/components/store-effects";
import { primaryCategoryLinks } from "@/lib/business-info";
import { getProductsResult } from "@/lib/server/products";

export default async function ShopPage({
  searchParams
}: {
  searchParams: Promise<{
    department?: string;
    family?: string;
    type?: string;
    audience?: string;
    category?: string;
    subcategory?: string;
    search?: string;
    filter?: string;
    price?: string;
    size?: string;
    sort?: string;
  }>;
}) {
  const [catalog, params] = await Promise.all([getProductsResult(), searchParams]);
  const products = catalog.ok ? catalog.value : [];

  return (
    <main className="shell storefront-shell" id="main-content" tabIndex={-1}>
        <div className="bg-aurora" aria-hidden="true">
          <span className="aurora aurora-1" />
          <span className="aurora aurora-2" />
          <span className="aurora aurora-3" />
          <span className="aurora aurora-4" />
        </div>
        <div className="noise-overlay" aria-hidden="true" />
        <StoreEffects />
        <Nav />
        {!catalog.ok ? <CatalogUnavailableNotice framed /> : null}
        <section className="shop-hero section-frame">
          <nav className="store-breadcrumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <ChevronRight size={14} />
            <span>Shop</span>
          </nav>
          <div className="shop-hero-content">
            <div>
              <span className="eyebrow">The full collection</span>
              <h1>Find exactly what fits your style.</h1>
              <p>Search, sort, and filter every piece across clothing, shoes, bags, and accessories.</p>
            </div>
            <div className="shop-hero-assurance">
              <span><Truck size={18} /> Flexible fulfillment</span>
              <span><ShieldCheck size={18} /> Secure account checkout</span>
            </div>
          </div>
          <div className="shop-category-links" aria-label="Popular categories">
            {primaryCategoryLinks.map((link) => (
              <Link href={link.href} key={link.value}>{link.label}</Link>
            ))}
          </div>
        </section>
        <div className="shop-page">
          {catalog.ok ? (
            <ProductBrowser
              products={products}
              title="Shop all products"
              eyebrow="Customer catalog"
              initialDepartment={params.department || "all"}
              initialCategory={params.family || params.category || "all"}
              initialSubcategory={params.type || params.subcategory || "all"}
              initialAudience={params.audience || "all"}
              initialSearch={params.search || ""}
              initialStockFilter={(params.filter as never) || "all"}
              initialPriceFilter={(params.price as never) || "all"}
              initialSizeFilter={(params.size as never) || "all"}
              initialSort={(params.sort as never) || "popular"}
              fullCatalog
            />
          ) : null}
        </div>
        <Footer />
    </main>
  );
}
