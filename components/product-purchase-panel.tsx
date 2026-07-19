"use client";

import { Check, ChevronDown, Heart, MapPin, ShieldCheck, ShoppingBag, Truck } from "lucide-react";
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

  function addToCart() {
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
      <section className="product-info-panel reveal" aria-labelledby="product-title">
        <span className="product-detail-kicker">
          {formatTaxonomyLabel(product.category)} / {formatTaxonomyLabel(product.subcategory)}
        </span>
        <h1 id="product-title">{product.name}</h1>
        <ProductRating
          productId={product.id}
          initialAverage={product.ratingAverage || 0}
          initialCount={product.reviewCount || 0}
        />
        <div className="product-about-copy">
          <h2>About this piece</h2>
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
      </section>

      <aside className="product-buy-panel glass-card reveal" aria-label="Purchase options">
        <span className="product-price-kicker">{discount ? "Sale price" : "Current price"}</span>
        <div className="product-detail-price">
          <strong>{formatPrice(currentPrice)}</strong>
          {compareAt ? <span>{formatPrice(compareAt)}</span> : null}
          {discount ? <small>{discount}% off</small> : null}
        </div>
        <p className="product-price-note">
          Delivery is calculated separately. We will confirm fulfillment details after your order is placed.
        </p>

        {sizes.length > 0 ? (
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
          <span>
            <Check size={16} /> {product.stock > 0 ? `${product.stock} in stock` : "Currently unavailable"}
          </span>
          <span>
            <Truck size={16} /> Lagos delivery available
          </span>
        </div>

        <div className="product-detail-actions">
          <button
            aria-describedby={sizes.length ? (sizeError ? "product-size-guidance product-size-error" : "product-size-guidance") : undefined}
            className="btn-primary"
            disabled={product.stock <= 0}
            type="button"
            onClick={addToCart}
          >
            <ShoppingBag size={18} />
            <span>Add to cart</span>
          </button>
          <button className="btn-ghost" type="button" onClick={() => toggleWishlist(product)}>
            <Heart size={18} fill={isWishlisted(product.id) ? "currentColor" : "none"} />
            <span>{isWishlisted(product.id) ? "Saved" : "Save"}</span>
          </button>
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
      </aside>
    </>
  );
}
