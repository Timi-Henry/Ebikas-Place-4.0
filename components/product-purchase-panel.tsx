"use client";

import { Check, ChevronDown, Heart, MapPin, PackageX, ShieldCheck, ShoppingBag, Truck } from "lucide-react";
import { useRef, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { ProductRating } from "@/components/product-rating";
import { businessInfo } from "@/lib/business-info";
import { formatTaxonomyLabel } from "@/lib/product-taxonomy";
import { storePickupAddress } from "@/lib/order-fulfillment";
import { formatPrice, getCompareAtPrice, getCurrentPrice, getDiscountPercent } from "@/lib/pricing";
import type { Product, ProductSize } from "@/lib/types";

export function ProductPurchasePanel({ product }: { product: Product }) {
  const { addItem, isWishlisted, toggleWishlist } = useCart();
  const sizes = product.sizes || [];
  const [selectedSize, setSelectedSize] = useState<ProductSize | undefined>();
  const [sizeError, setSizeError] = useState("");
  const sizePickerRef = useRef<HTMLFieldSetElement>(null);
  const currentPrice = getCurrentPrice(product);
  const compareAt = getCompareAtPrice(product);
  const discount = getDiscountPercent(product);
  const soldOut = product.stock <= 0;

  function addToCart() {
    if (soldOut) return;

    if (sizes.length > 0 && !selectedSize) {
      setSizeError("Choose a size before adding this item to your cart.");
      sizePickerRef.current?.focus();
      return;
    }

    setSizeError("");
    addItem(product, selectedSize);
  }

  return (
    <>
      <aside className="product-buy-panel glass-card reveal" aria-label="Purchase options">
        <span className="product-price-kicker">{discount ? "Sale price" : "Current price"}</span>
        <strong className="product-buy-name">{product.name}</strong>
        <ProductRating
          productId={product.id}
          initialAverage={product.ratingAverage || 0}
          initialCount={product.reviewCount || 0}
        />
        <div className="product-detail-price">
          <strong>{formatPrice(currentPrice)}</strong>
          {compareAt ? <span>{formatPrice(compareAt)}</span> : null}
          {discount ? <small>{discount}% off</small> : null}
        </div>
        <p className="product-price-note">
          Delivery is calculated separately. We will confirm fulfillment details after your order is placed.
        </p>

        {soldOut ? (
          <div className="product-sold-out-notice" role="status">
            <PackageX size={22} aria-hidden="true" />
            <span>
              <strong>Sold out</strong>
              <small>This item is currently unavailable. Save it and check back soon.</small>
            </span>
          </div>
        ) : null}

        {sizes.length > 0 && !soldOut ? (
          <fieldset
            aria-describedby={sizeError ? "product-size-guidance product-size-error" : "product-size-guidance"}
            aria-invalid={Boolean(sizeError)}
            aria-required="true"
            className="size-picker"
            ref={sizePickerRef}
            tabIndex={-1}
          >
            <legend>
              Choose size <span>(required)</span>
            </legend>
            <div>
              {sizes.map((size) => (
                <button
                  aria-pressed={selectedSize === size}
                  className={selectedSize === size ? "active" : ""}
                  key={size}
                  type="button"
                  onClick={() => {
                    setSelectedSize(size);
                    setSizeError("");
                  }}
                >
                  {size}
                </button>
              ))}
            </div>
            <small className="size-picker-guidance" id="product-size-guidance">
              Select one available size to add this item.
            </small>
            {sizeError ? (
              <p id="product-size-error" role="alert">
                {sizeError}
              </p>
            ) : null}
          </fieldset>
        ) : null}

        <div className="product-stock-row">
          <span className={`product-stock-state ${soldOut ? "is-sold-out" : ""}`}>
            {soldOut ? <PackageX size={16} /> : <Check size={16} />}
            {soldOut ? "Sold out" : `${product.stock} in stock`}
          </span>
          <span>
            <Truck size={16} /> Lagos delivery available
          </span>
        </div>

        <div className="product-detail-actions">
          <button
            aria-describedby={!soldOut && sizes.length ? (sizeError ? "product-size-guidance product-size-error" : "product-size-guidance") : undefined}
            className="btn-primary"
            disabled={soldOut}
            type="button"
            onClick={addToCart}
          >
            {soldOut ? <PackageX size={18} /> : <ShoppingBag size={18} />}
            <span>{soldOut ? "Sold out" : "Add to cart"}</span>
          </button>
          <button className="btn-ghost" type="button" onClick={() => toggleWishlist(product)}>
            <Heart size={18} fill={isWishlisted(product.id) ? "currentColor" : "none"} />
            <span>{isWishlisted(product.id) ? "Saved" : "Save"}</span>
          </button>
        </div>
      </aside>

      <section className="product-info-panel reveal" aria-labelledby="product-title">
        <header className="product-info-heading">
          <span className="product-detail-kicker">
            {formatTaxonomyLabel(product.category)} / {formatTaxonomyLabel(product.subcategory)}
          </span>
          <h1 id="product-title">{product.name}</h1>
        </header>

        <div className="product-info-content">
          <div className="product-about-copy">
            <h2>About this product</h2>
            <p>{product.description}</p>
          </div>
          <dl className="product-quick-facts">
            <div>
              <dt>Department</dt>
              <dd>{formatTaxonomyLabel(product.category)}</dd>
            </div>
            <div>
              <dt>Style</dt>
              <dd>{formatTaxonomyLabel(product.subcategory)}</dd>
            </div>
            <div>
              <dt>Fulfillment</dt>
              <dd>Delivery or rider pickup</dd>
            </div>
          </dl>
        </div>

        <div className="product-buy-assurance">
          <span>
            <ShieldCheck size={17} />
            <b>Secure ordering</b>
            <small>Protected account checkout</small>
          </span>
          <span>
            <MapPin size={17} />
            <b>Flexible pickup</b>
            <small>Send your preferred rider</small>
          </span>
        </div>

        <div className="product-buy-accordions">
          <details>
            <summary>
              Delivery and pickup <ChevronDown size={17} />
            </summary>
            <p>Choose store delivery within Lagos State or send your own rider to {storePickupAddress}.</p>
          </details>
          <details>
            <summary>
              Ordering support <ChevronDown size={17} />
            </summary>
            <p>
              Call {businessInfo.phone} or message us on WhatsApp if you need sizing, availability, or pickup help
              before ordering.
            </p>
          </details>
        </div>
      </section>
    </>
  );
}
