"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AuthToastWatcher } from "@/components/auth-toast-watcher";
import { ToastProvider, useToast } from "@/components/toast-provider";
import {
  CART_STORAGE_KEY,
  LEGACY_CART_STORAGE_KEY,
  LEGACY_WISHLIST_STORAGE_KEY,
  WISHLIST_STORAGE_KEY,
  decodeCartStorage,
  decodeWishlistStorage,
  encodeCartStorage,
  encodeWishlistStorage,
  type StoredCartLine
} from "@/lib/cart-storage";
import { getCurrentPrice } from "@/lib/pricing";
import type { OrderItem, Product, ProductSize } from "@/lib/types";

type CartItem = Product & { quantity: number; selectedSize?: ProductSize };
type HydrationStatus = "loading" | "ready" | "failed";

type CartContextValue = {
  items: CartItem[];
  wishlistItems: Product[];
  count: number;
  wishlistCount: number;
  subtotal: number;
  hydrated: boolean;
  addItem: (product: Product, selectedSize?: ProductSize) => void;
  reorderItems: (items: OrderItem[]) => void;
  changeQuantity: (id: string, delta: number, selectedSize?: ProductSize) => void;
  removeItem: (id: string, selectedSize?: ProductSize) => void;
  toggleWishlist: (product: Product) => void;
  removeWishlist: (id: string) => void;
  isWishlisted: (id: string) => boolean;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function readCartLines() {
  try {
    return decodeCartStorage(
      window.localStorage.getItem(CART_STORAGE_KEY),
      window.localStorage.getItem(LEGACY_CART_STORAGE_KEY)
    );
  } catch {
    return [];
  }
}

function readWishlistIds() {
  try {
    return decodeWishlistStorage(
      window.localStorage.getItem(WISHLIST_STORAGE_KEY),
      window.localStorage.getItem(LEGACY_WISHLIST_STORAGE_KEY)
    );
  } catch {
    return [];
  }
}

async function loadCurrentProducts(productIds: readonly string[]) {
  const ids = [...new Set(productIds)].slice(0, 50);
  if (ids.length === 0) return [];
  const response = await fetch(`/api/products?ids=${encodeURIComponent(ids.join(","))}`, {
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(data.products)) {
    throw new Error("Catalog products could not be loaded.");
  }
  return data.products as Product[];
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <CartProviderInner>{children}</CartProviderInner>
      <AuthToastWatcher />
    </ToastProvider>
  );
}

function CartProviderInner({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [wishlistItems, setWishlistItems] = useState<Product[]>([]);
  const [hydrationStatus, setHydrationStatus] = useState<HydrationStatus>("loading");
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const cartLines = readCartLines();
      const wishlistIds = readWishlistIds();
      try {
        const products = await loadCurrentProducts([
          ...cartLines.map((line) => line.productId),
          ...wishlistIds
        ]);
        if (cancelled) return;
        const productById = new Map(products.map((product) => [product.id, product]));
        setItems(
          cartLines.flatMap((line) => {
            const product = productById.get(line.productId);
            if (!product || product.stock < 1) return [];
            if (product.sizes?.length && (!line.selectedSize || !product.sizes.includes(line.selectedSize))) return [];
            if (!product.sizes?.length && line.selectedSize) return [];
            return [{ ...product, selectedSize: line.selectedSize, quantity: Math.min(line.quantity, product.stock, 10) }];
          })
        );
        setWishlistItems(wishlistIds.flatMap((id) => (productById.has(id) ? [productById.get(id)!] : [])));
        setHydrationStatus("ready");
      } catch {
        if (!cancelled) setHydrationStatus("failed");
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (hydrationStatus !== "ready") return;
    try {
      const lines = items.map<StoredCartLine>((item) => ({
        productId: item.id,
        selectedSize: item.selectedSize,
        quantity: item.quantity
      }));
      window.localStorage.setItem(CART_STORAGE_KEY, encodeCartStorage(lines));
      window.localStorage.removeItem(LEGACY_CART_STORAGE_KEY);
    } catch {
      // Storage can be disabled or full; the in-memory cart remains usable.
    }
  }, [hydrationStatus, items]);

  useEffect(() => {
    if (hydrationStatus !== "ready") return;
    try {
      window.localStorage.setItem(
        WISHLIST_STORAGE_KEY,
        encodeWishlistStorage(wishlistItems.map((item) => item.id))
      );
      window.localStorage.removeItem(LEGACY_WISHLIST_STORAGE_KEY);
    } catch {
      // Storage can be disabled or full; the in-memory wishlist remains usable.
    }
  }, [hydrationStatus, wishlistItems]);

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    const wishlistCount = wishlistItems.length;
    const subtotal = items.reduce((sum, item) => sum + getCurrentPrice(item) * item.quantity, 0);

    return {
      items,
      wishlistItems,
      count,
      wishlistCount,
      subtotal,
      hydrated: hydrationStatus !== "loading",
      addItem(product, selectedSize) {
        if (product.stock < 1) {
          showToast({ title: "Out of stock", message: `${product.name} is currently unavailable.`, tone: "warning" });
          return;
        }
        setItems((current) => {
          const existing = current.find((item) => item.id === product.id && item.selectedSize === selectedSize);
          if (existing) {
            return current.map((item) =>
              item.id === product.id && item.selectedSize === selectedSize
                ? { ...item, quantity: Math.min(item.quantity + 1, product.stock, 10) }
                : item
            );
          }
          return [...current, { ...product, selectedSize, quantity: 1 }];
        });
        if (hydrationStatus === "failed") setHydrationStatus("ready");
        showToast({
          title: "Added to cart",
          message: `${product.name}${selectedSize ? `, size ${selectedSize}` : ""} is in your cart.`,
          tone: "success"
        });
      },
      changeQuantity(id, delta, selectedSize) {
        setItems((current) =>
          current
            .map((item) =>
              item.id === id && item.selectedSize === selectedSize
                ? { ...item, quantity: Math.min(item.quantity + delta, item.stock, 10) }
                : item
            )
            .filter((item) => item.quantity > 0)
        );
      },
      reorderItems(orderItems) {
        void (async () => {
          try {
            const products = await loadCurrentProducts(orderItems.map((item) => item.productId));
            const productById = new Map(products.map((product) => [product.id, product]));
            let added = 0;
            setItems((current) => {
              const next = current.map((item) => ({ ...item }));
              for (const orderItem of orderItems) {
                const product = productById.get(orderItem.productId);
                if (!product || product.stock < 1) continue;
                if (product.sizes?.length && (!orderItem.selectedSize || !product.sizes.includes(orderItem.selectedSize))) continue;
                if (!product.sizes?.length && orderItem.selectedSize) continue;
                const quantity = Math.min(orderItem.quantity, product.stock, 10);
                const existing = next.find(
                  (item) => item.id === product.id && item.selectedSize === orderItem.selectedSize
                );
                if (existing) {
                  existing.quantity = Math.min(existing.quantity + quantity, product.stock, 10);
                } else {
                  next.push({ ...product, selectedSize: orderItem.selectedSize, quantity });
                }
                added += 1;
              }
              return next;
            });
            if (hydrationStatus === "failed") setHydrationStatus("ready");
            showToast({
              title: added ? "Added to cart" : "Items unavailable",
              message: added
                ? `${added} current product${added === 1 ? "" : "s"} added at today’s price and availability.`
                : "Those products or sizes are no longer available.",
              tone: added ? "success" : "warning"
            });
          } catch {
            showToast({
              title: "Could not add those items",
              message: "The current catalog could not be checked. Try again shortly.",
              tone: "error"
            });
          }
        })();
      },
      removeItem(id, selectedSize) {
        setItems((current) => current.filter((item) => item.id !== id || item.selectedSize !== selectedSize));
      },
      toggleWishlist(product) {
        const alreadySaved = wishlistItems.some((item) => item.id === product.id);
        setWishlistItems((current) => {
          if (current.some((item) => item.id === product.id)) {
            return current.filter((item) => item.id !== product.id);
          }
          return [...current, product];
        });
        if (hydrationStatus === "failed") setHydrationStatus("ready");
        showToast({
          title: alreadySaved ? "Removed from wishlist" : "Added to wishlist",
          message: alreadySaved ? `${product.name} was removed from your wishlist.` : `${product.name} was saved for later.`,
          tone: alreadySaved ? "info" : "success"
        });
      },
      removeWishlist(id) {
        setWishlistItems((current) => current.filter((item) => item.id !== id));
      },
      isWishlisted(id) {
        return wishlistItems.some((item) => item.id === id);
      },
      clear() {
        setItems([]);
      }
    };
  }, [hydrationStatus, items, showToast, wishlistItems]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used inside CartProvider");
  }
  return context;
}
