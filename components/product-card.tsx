import { ArrowUpRight, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { ProductCardActions, type ProductCardActionProduct } from "@/components/product-card-actions";
import {
  defaultCatalogTaxonomy,
  formatTaxonomyLabel,
  getCatalogAudience,
  getCatalogProductType,
  hydrateProductTaxonomy
} from "@/lib/product-taxonomy";
import { formatPrice, getCompareAtPrice, getCurrentPrice, getDiscountPercent } from "@/lib/pricing";
import type { Product } from "@/lib/types";

type ProductBadgeView = {
  label: string;
  tone: "stock" | "sold" | "featured" | "best-seller" | "new";
};

export type ProductCardModel = {
  id: string;
  name: string;
  imageUrl: string;
  facetSummary: string;
  stock: number;
  currentPrice: number;
  compareAt?: number;
  discount: number;
  imageBadges: ProductBadgeView[];
  merchandisingBadges: ProductBadgeView[];
  ratingAverage?: number;
  reviewCount: number;
  priority: boolean;
  actionProduct: ProductCardActionProduct;
};

function productFacetSummary(product: Product) {
  const taxonomy = hydrateProductTaxonomy(product);
  const typeLabel =
    getCatalogProductType(defaultCatalogTaxonomy, taxonomy.productTypeId)?.label ||
    formatTaxonomyLabel(taxonomy.productTypeId);
  const audienceLabel = taxonomy.audienceIds
    .map((id) => getCatalogAudience(defaultCatalogTaxonomy, id)?.label || formatTaxonomyLabel(id))
    .join(", ");
  return audienceLabel ? `${audienceLabel} / ${typeLabel}` : typeLabel;
}

export function createProductCardModel(product: Product, options: { priority?: boolean } = {}): ProductCardModel {
  const badges = [
    product.stock > 0 && product.stock <= 3
      ? { label: `Only ${product.stock} left`, tone: "stock" as const }
      : null,
    product.stock === 0 ? { label: "Sold out", tone: "sold" as const } : null,
    product.featured ? { label: "Featured", tone: "featured" as const } : null,
    product.badges?.includes("best-seller")
      ? { label: "Best seller", tone: "best-seller" as const }
      : null,
    product.badges?.includes("new") ? { label: "New", tone: "new" as const } : null
  ].filter((badge): badge is ProductBadgeView => Boolean(badge));

  return {
    id: product.id,
    name: product.name,
    imageUrl: product.imageUrl,
    facetSummary: productFacetSummary(product),
    stock: product.stock,
    currentPrice: getCurrentPrice(product),
    compareAt: getCompareAtPrice(product),
    discount: getDiscountPercent(product),
    imageBadges: badges.filter((badge) => badge.tone === "stock" || badge.tone === "sold"),
    merchandisingBadges: badges.filter((badge) => badge.tone !== "stock" && badge.tone !== "sold"),
    ratingAverage: product.ratingAverage,
    reviewCount: product.reviewCount || 0,
    priority: options.priority === true,
    actionProduct: {
      id: product.id,
      name: product.name,
      imageUrl: product.imageUrl,
      price: product.price,
      stock: product.stock,
      ...(product.salePrice ? { salePrice: product.salePrice } : {}),
      ...(product.sizes?.length ? { sizes: product.sizes } : {})
    }
  };
}

export function ProductCard({ product }: { product: ProductCardModel }) {
  const hasReviews = product.reviewCount > 0;

  return (
    <article className="product-card reveal">
      <Link className="product-link" href={`/products/${product.id}`}>
        <div className="product-image">
          {product.discount > 0 || product.imageBadges.length ? (
            <span className="product-label-rail" aria-label="Product highlights">
              {product.discount > 0 ? (
                <span className="product-discount-ribbon">{product.discount}% Off</span>
              ) : null}
              {product.imageBadges.length ? (
                <span className="product-badge-stack">
                  {product.imageBadges.map((badge) => (
                    <span className={`product-badge product-badge-${badge.tone}`} key={badge.label}>
                      {badge.label}
                    </span>
                  ))}
                </span>
              ) : null}
            </span>
          ) : null}
          <Image
            className="product-primary-image"
            src={product.imageUrl}
            alt={product.name}
            fill
            priority={product.priority}
            sizes="(max-width: 760px) 64vw, (max-width: 1020px) 25vw, (max-width: 1240px) 20vw, 17vw"
          />
          <span className="product-view-link">
            View details <ArrowUpRight size={15} />
          </span>
        </div>
      </Link>
      <div className="product-content">
        <div className="product-meta">
          <span>{product.facetSummary}</span>
          <span className="product-stock-status">
            <span className={product.stock > 0 ? "stock-dot" : "stock-dot stock-dot-out"} />
            {product.stock > 0 ? `${product.stock} in stock` : "Unavailable"}
          </span>
        </div>
        <div className={`product-card-rating ${hasReviews ? "" : "product-card-rating-empty"}`}>
          <Star size={14} fill="currentColor" />
          {hasReviews ? (
            <>
              <span>{product.ratingAverage ? product.ratingAverage.toFixed(1) : "0.0"}</span>
              <small>({product.reviewCount})</small>
            </>
          ) : (
            <span>No reviews yet</span>
          )}
        </div>
        <Link className="product-copy-link" href={`/products/${product.id}`}>
          <h3 className="product-title">{product.name}</h3>
        </Link>
        {product.merchandisingBadges.length ? (
          <div className="product-merchandising-tags" aria-label="Product labels">
            {product.merchandisingBadges.map((badge) => (
              <span className={`product-badge product-badge-${badge.tone}`} key={badge.label}>
                {badge.label}
              </span>
            ))}
          </div>
        ) : null}
        <div className="price-row">
          <span className="price-block">
            {product.compareAt ? <small>{formatPrice(product.compareAt)}</small> : null}
            <span className="price">{formatPrice(product.currentPrice)}</span>
          </span>
          <ProductCardActions product={product.actionProduct} />
        </div>
      </div>
    </article>
  );
}
