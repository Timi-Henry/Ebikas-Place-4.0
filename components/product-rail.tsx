import Link from "next/link";
import { ProductCard, type ProductCardModel } from "@/components/product-card";
import { ProductCarousel } from "@/components/product-carousel";

export function ProductRail({
  products,
  title,
  eyebrow,
  sectionId = "shop",
  compact = false,
  autoScroll = false,
  carouselLabel,
  description,
  variant = "default",
  emptyMessage = "No featured products yet.",
  ctaHref,
  ctaLabel = "All products",
  secondaryCtaHref,
  secondaryCtaLabel
}: {
  products: ProductCardModel[];
  title: string;
  eyebrow: string;
  sectionId?: string;
  compact?: boolean;
  autoScroll?: boolean;
  carouselLabel?: string;
  description?: string;
  variant?: "default" | "sale";
  emptyMessage?: string;
  ctaHref?: string;
  ctaLabel?: string;
  secondaryCtaHref?: string;
  secondaryCtaLabel?: string;
}) {
  const cards = products.map((product) => <ProductCard product={product} key={product.id} />);

  return (
    <section className={`section product-rail-section product-rail-${variant}`} id={sectionId}>
      <div className="section-head">
        <div>
          <span className="eyebrow reveal">{eyebrow}</span>
          <h2 className="reveal">{title}</h2>
          {description ? <p className="product-rail-description reveal">{description}</p> : null}
        </div>
        {variant === "sale" ? (
          <span className="sale-rail-status reveal">
            <i aria-hidden="true" />
            Fresh offers rotate automatically
          </span>
        ) : null}
      </div>
      {products.length > 0 ? (
        autoScroll ? (
          <ProductCarousel
            itemCount={products.length}
            intervalMs={variant === "sale" ? 4700 : 3600}
            label={carouselLabel || `${eyebrow.toLowerCase()} products`}
          >
            {cards}
          </ProductCarousel>
        ) : (
          <div className={`product-grid ${compact ? "product-grid-compact" : ""}`}>{cards}</div>
        )
      ) : (
        <p className="notice">{emptyMessage}</p>
      )}
      {ctaHref || secondaryCtaHref ? (
        <div className="section-cta reveal">
          {secondaryCtaHref && secondaryCtaLabel ? (
            <Link className="btn-ghost" href={secondaryCtaHref}>
              {secondaryCtaLabel}
            </Link>
          ) : null}
          {ctaHref ? (
            <Link className="btn-primary" href={ctaHref}>
              {ctaLabel}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
