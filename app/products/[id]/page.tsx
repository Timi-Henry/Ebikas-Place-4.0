import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { CatalogUnavailableNotice } from "@/components/catalog-unavailable-notice";
import { Footer } from "@/components/footer";
import { Nav } from "@/components/nav";
import { ProductImageGallery } from "@/components/product-image-gallery";
import { createProductCardModel } from "@/components/product-card";
import { ProductPurchasePanel } from "@/components/product-purchase-panel";
import { ProductRail } from "@/components/product-rail";
import { RecentlyViewedProducts } from "@/components/recently-viewed-products";
import { StoreEffects } from "@/components/store-effects";
import { businessInfo } from "@/lib/business-info";
import { formatTaxonomyLabel, hydrateProductTaxonomy } from "@/lib/product-taxonomy";
import { getCurrentPrice } from "@/lib/pricing";
import { getProductByIdResult, getProductsResult } from "@/lib/server/products";

function safeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const catalog = await getProductByIdResult(id);
  const product = catalog.ok ? catalog.value : null;

  return {
    title: product ? `${product.name} | Ebikas Place` : "Product | Ebikas Place",
    description: product?.description || "Shop Ebikas Place products.",
    ...(!catalog.ok ? { robots: { index: false, follow: true } } : {})
  };
}

function ProductCatalogUnavailablePage() {
  return (
    <main className="shell storefront-shell" id="main-content" tabIndex={-1}>
      <StoreEffects />
      <Nav />
      <CatalogUnavailableNotice framed />
      <Footer />
    </main>
  );
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [productResult, productsResult] = await Promise.all([getProductByIdResult(id), getProductsResult()]);

  if (!productResult.ok) {
    return <ProductCatalogUnavailablePage />;
  }

  const product = productResult.value;
  const products = productsResult.ok ? productsResult.value : [];

  if (!product) {
    notFound();
  }

  const productTaxonomy = hydrateProductTaxonomy(product);
  const relatedProducts = products
    .filter((item) => item.id !== product.id && hydrateProductTaxonomy(item).familyId === productTaxonomy.familyId)
    .sort((a, b) => {
      const aTaxonomy = hydrateProductTaxonomy(a);
      const bTaxonomy = hydrateProductTaxonomy(b);
      const aScore = Number(aTaxonomy.productTypeId === productTaxonomy.productTypeId) * 2 + Number(aTaxonomy.audienceIds.some((id) => productTaxonomy.audienceIds.includes(id)));
      const bScore = Number(bTaxonomy.productTypeId === productTaxonomy.productTypeId) * 2 + Number(bTaxonomy.audienceIds.some((id) => productTaxonomy.audienceIds.includes(id)));
      return bScore - aScore;
    })
    .slice(0, 6);
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: [product.imageUrl, ...(product.imageUrls || [])].filter(Boolean),
    category: `${formatTaxonomyLabel(product.category)} / ${formatTaxonomyLabel(product.subcategory)}`,
    brand: {
      "@type": "Brand",
      name: businessInfo.name
    },
    offers: {
      "@type": "Offer",
      priceCurrency: "NGN",
      price: getCurrentPrice(product),
      availability: product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      areaServed: businessInfo.deliveryArea
    },
    ...(product.reviewCount && product.reviewCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.ratingAverage || 0,
            reviewCount: product.reviewCount
          }
        }
      : {})
  };

  return (
    <main className="shell storefront-shell" id="main-content" tabIndex={-1}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(productJsonLd) }} />
        <div className="bg-aurora" aria-hidden="true">
          <span className="aurora aurora-1" />
          <span className="aurora aurora-2" />
          <span className="aurora aurora-3" />
          <span className="aurora aurora-4" />
        </div>
        <div className="noise-overlay" aria-hidden="true" />
        <StoreEffects />
        <Nav />
        {!productsResult.ok ? (
          <CatalogUnavailableNotice
            framed
            title="Recommendations are temporarily unavailable."
            message="This product is available to view, but related products could not be loaded right now."
          />
        ) : null}
        <section className="product-detail-shell section-frame">
          <nav className="store-breadcrumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <ChevronRight size={14} />
            <Link href="/shop">Shop</Link>
            <ChevronRight size={14} />
            <Link href={`/shop?category=${encodeURIComponent(product.category)}`}>{formatTaxonomyLabel(product.category)}</Link>
            <ChevronRight size={14} />
            <span>{product.name}</span>
          </nav>
          <section className="product-detail-page">
            <ProductImageGallery product={product} />
            <ProductPurchasePanel product={product} />
          </section>
        </section>
        <ProductRail
          products={relatedProducts.map((relatedProduct) => createProductCardModel(relatedProduct))}
          title="Related products"
          eyebrow={`${formatTaxonomyLabel(product.category)} / ${formatTaxonomyLabel(product.subcategory)}`}
          compact
          emptyMessage="No related products yet."
          secondaryCtaHref={`/shop?family=${encodeURIComponent(productTaxonomy.familyId)}&type=${encodeURIComponent(productTaxonomy.productTypeId)}`}
          secondaryCtaLabel="More like this"
          ctaHref="/shop"
          ctaLabel="All products"
        />
        <RecentlyViewedProducts currentProductId={product.id} />
        <Footer />
    </main>
  );
}
