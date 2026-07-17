"use client";

import { Heart, ShoppingBag, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useCart } from "@/components/cart-provider";
import { useOverlayDialog } from "@/components/use-overlay-dialog";
import { formatPrice, getCurrentPrice } from "@/lib/pricing";

export function WishlistDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useOverlayDialog<HTMLElement>(open, onClose);
  const { wishlistItems, removeWishlist, addItem } = useCart();

  if (!open) return null;

  return (
    <>
      <button className="drawer-backdrop" type="button" aria-label="Close wishlist" onClick={onClose} />
      <aside ref={dialogRef} className="drawer" role="dialog" aria-modal="true" aria-label="Wishlist" tabIndex={-1}>
        <div className="drawer-head">
          <strong><Heart size={18} /> Wishlist</strong>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close wishlist" data-dialog-close>
            <X size={16} />
          </button>
        </div>
        <div className="cart-list">
          {wishlistItems.length === 0 ? (
            <div className="cart-empty">
              <Heart size={36} />
              <p>Your wishlist is empty</p>
              <span>Tap the heart on products you want to save for later.</span>
            </div>
          ) : (
            wishlistItems.map((item) => (
              <article className="cart-item" key={item.id}>
                <Link href={`/products/${item.id}`} onClick={onClose}>
                  <img src={item.imageUrl} alt="" width={86} height={104} loading="lazy" />
                </Link>
                <div>
                  <strong>{item.name}</strong>
                  <p>{formatPrice(getCurrentPrice(item))}</p>
                  <div className="cart-controls">
                    <button
                      className="qty-btn"
                      type="button"
                      onClick={() => {
                        if (item.sizes?.length) {
                          window.location.href = `/products/${item.id}`;
                          return;
                        }
                        addItem(item);
                      }}
                      aria-label={`Add ${item.name} to cart`}
                    >
                      <ShoppingBag size={14} />
                    </button>
                    <button className="qty-btn" type="button" onClick={() => removeWishlist(item.id)} aria-label={`Remove ${item.name}`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
        <div className="drawer-foot">
          <span>{wishlistItems.length} saved item{wishlistItems.length === 1 ? "" : "s"}</span>
          <Link className="btn-primary" href="/shop" onClick={onClose}>
            Shop
          </Link>
        </div>
      </aside>
    </>
  );
}
