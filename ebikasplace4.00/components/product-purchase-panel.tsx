"use client";

import { Check, ChevronDown, Heart, MapPin, Phone, Ruler, ShieldCheck, ShoppingBag, Truck } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/components/cart-provider";
import { ProductRating } from "@/components/product-rating";
import { formatTaxonomyLabel } from "@/lib/product-taxonomy";
import { fulfillmentPaymentNotes, storePickupAddress } from "@/lib/order-fulfillment";
import { formatPrice, getCompareAtPrice, getCurrentPrice, getDiscountPercent } from "@/lib/pricing";
import type { Product, ProductSize } from "@/lib/types";

export function ProductPurchasePanel({ product }: { product: Product }) {
  const { addItem, isWishlisted, toggleWishlist } = useCart();
  const sizes = product.sizes || [];
  const [selectedSize, setSelectedSize] = useState<ProductSize | undefined>();
  const [sizeError, setSizeError] = useState("");
  const currentPrice = getCurrentPrice(product);
  const compareAt = getCompareAtPrice(product);
  const discount = getDiscountPercent(product);

  function addToCart() {
    if (sizes.length > 0 && !selectedSize) {
      setSizeError("Choose a size before adding this item to your cart.");
      return;
    }

    setSizeError("");
    addItem(product, selectedSize);
  }

  return (
    <aside className="product-buy-panel glass-card reveal">
      <div className="product-buy-heading">
        <span className="product-detail-kicker">{formatTaxonomyLabel(product.category)} / {formatTaxonomyLabel(product.subcategory)}</span>
        <h1>{product.name}</h1>
        <p>{product.description}</p>
      </div>
      <ProductRating productId={product.id} initialAverage={product.ratingAverage || 0} initialCount={product.reviewCount || 0} />
      <div className="product-detail-price">
        <strong>{formatPrice(currentPrice)}</strong>
        {compareAt ? <span>{formatPrice(compareAt)}</span> : null}
        {discount ? <small>{discount}% off</small> : null}
      </div>
      <p className="product-price-note">Price shown before delivery. We’ll confirm fulfillment details after your order is placed.</p>
      {sizes.length > 0 ? (
        <fieldset className="size-picker" aria-describedby={sizeError ? "product-size-error" : undefined}>
          <legend>Choose size</legend>
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
          {sizeError ? <p id="product-size-error" role="alert">{sizeError}</p> : null}
        </fieldset>
      ) : null}
      <div className="product-stock-row">
        <span><Check size={16} /> {product.stock > 0 ? `${product.stock} in stock` : "Currently unavailable"}</span>
        <span><Truck size={16} /> Delivery available</span>
      </div>
      <div className="product-trust-grid">
        <span><Truck size={16} /> {fulfillmentPaymentNotes["store-delivery"]}</span>
        <span><MapPin size={16} /> Rider pickup: {storePickupAddress}</span>
        <span><ShieldCheck size={16} /> Contact us after order confirmation for order support</span>
        <span><Ruler size={16} /> Choose a size before checkout when sizes are listed</span>
        <a href="tel:09061199345"><Phone size={16} /> Call/WhatsApp 09061199345</a>
      </div>
      <div className="product-detail-actions">
        <button className="btn-primary" type="button" onClick={addToCart} disabled={product.stock <= 0}>
          <ShoppingBag size={18} />
          <span>Add to cart</span>
        </button>
        <button className="btn-ghost" type="button" onClick={() => toggleWishlist(product)}>
          <Heart size={18} fill={isWishlisted(product.id) ? "currentColor" : "none"} />
          <span>{isWishlisted(product.id) ? "Saved" : "Save"}</span>
        </button>
      </div>
      <div className="product-buy-accordions">
        <details>
          <summary>Delivery and pickup <ChevronDown size={17} /></summary>
          <p>Choose store delivery within Lagos State or send your own rider to {storePickupAddress}.</p>
        </details>
        <details>
          <summary>Ordering support <ChevronDown size={17} /></summary>
          <p>Call or WhatsApp 09061199345 if you need sizing, availability, or pickup help before ordering.</p>
        </details>
      </div>
    </aside>
  );
}
