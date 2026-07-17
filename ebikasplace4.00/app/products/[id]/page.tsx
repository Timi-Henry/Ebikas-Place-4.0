import { notFound } from "next/navigation";
import { ChevronRight, Headphones, ShieldCheck, Truck } from "lucide-react";
import { CartProvider } from "@/components/cart-provider";
import { Footer } from "@/components/footer";
import { Nav } from "@/components/nav";
import { ProductImageGallery } from "@/components/product-image-gallery";
import { ProductBrowser } from "@/components/product-browser";
import { ProductPurchasePanel } from "@/components/product-purchase-panel";
import { RecentlyViewedProducts } from "@/components/recently-viewed-products";
import { StoreEffects } from "@/components/store-effects";
import { businessInfo } from "@/lib/business-info";
import { formatTaxonomyLabel, hydrateProductTaxonomy } from "@/lib/product-taxonomy";
import { getCurrentPrice } from "@/lib/pricing";
import { getProductById, getProducts } from "@/lib/server/products";

function safeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProductById(id);

  return {
    title: product ? `${product.name} | Ebikas Place` : "Product | Ebikas Place",
    description: product?.description || "Shop Ebikas Place products."
  };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, products] = await Promise.all([getProductById(id), getProducts()]);

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
    <CartProvider>
      <main className="shell storefront-shell" id="main-content">
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
        <section className="product-detail-shell section-frame">
          <nav className="store-breadcrumbs" aria-label="Breadcrumb">
            <a href="/">Home</a>
            <ChevronRight size={14} />
            <a href="/shop">Shop</a>
            <ChevronRight size={14} />
            <a href={`/shop?category=${encodeURIComponent(product.category)}`}>{formatTaxonomyLabel(product.category)}</a>
            <ChevronRight size={14} />
            <span>{product.name}</span>
          </nav>
          <section className="product-detail-page">
            <ProductImageGallery product={product} />
            <ProductPurchasePanel product={product} />
          </section>
          <div className="product-service-row" aria-label="Purchase support">
            <span><Truck size={19} /><b>Delivery &amp; pickup</b><small>Choose your option at checkout</small></span>
            <span><ShieldCheck size={19} /><b>Secure ordering</b><small>Your account keeps details protected</small></span>
            <span><Headphones size={19} /><b>Need help?</b><small>Call or WhatsApp {businessInfo.phone}</small></span>
          </div>
        </section>
        <ProductBrowser
          products={relatedProducts}
          title="Related products"
          eyebrow={`${formatTaxonomyLabel(product.category)} / ${formatTaxonomyLabel(product.subcategory)}`}
          showControls={false}
          productLimit={6}
          compact
          emptyMessage="No related products yet."
          secondaryCtaHref={`/shop?family=${encodeURIComponent(productTaxonomy.familyId)}&type=${encodeURIComponent(productTaxonomy.productTypeId)}`}
          secondaryCtaLabel="More like this"
          ctaHref="/shop"
          ctaLabel="All products"
        />
        <RecentlyViewedProducts currentProduct={product} products={products} />
        <Footer />
      </main>
    </CartProvider>
  );
}
