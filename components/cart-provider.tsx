"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AuthToastWatcher } from "@/components/auth-toast-watcher";
import { ToastProvider, useToast } from "@/components/toast-provider";
import { getCurrentPrice } from "@/lib/pricing";
import type { OrderItem, Product, ProductSize } from "@/lib/types";

type CartItem = Product & { quantity: number; selectedSize?: ProductSize };

type CartContextValue = {
  items: CartItem[];
  wishlistItems: Product[];
  count: number;
  wishlistCount: number;
  subtotal: number;
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
  const { showToast } = useToast();

  useEffect(() => {
    const saved = window.localStorage.getItem("ebikas-cart-v2");
    const savedWishlist = window.localStorage.getItem("ebikas-wishlist-v1");

    try {
      const parsed = saved ? JSON.parse(saved) : [];
      if (Array.isArray(parsed)) {
        setItems(parsed);
      }
      const parsedWishlist = savedWishlist ? JSON.parse(savedWishlist) : [];
      if (Array.isArray(parsedWishlist)) {
        setWishlistItems(parsedWishlist);
      }
    } catch {
      setItems([]);
      setWishlistItems([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("ebikas-cart-v2", JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    window.localStorage.setItem("ebikas-wishlist-v1", JSON.stringify(wishlistItems));
  }, [wishlistItems]);

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
      addItem(product, selectedSize) {
        setItems((current) => {
          const existing = current.find((item) => item.id === product.id && item.selectedSize === selectedSize);
          if (existing) {
            return current.map((item) =>
              item.id === product.id && item.selectedSize === selectedSize ? { ...item, quantity: item.quantity + 1 } : item
            );
          }
          return [...current, { ...product, selectedSize, quantity: 1 }];
        });
        showToast({
          title: "Added to cart",
          message: `${product.name}${selectedSize ? `, size ${selectedSize}` : ""} is in your cart.`,
          tone: "success"
        });
      },
      changeQuantity(id, delta, selectedSize) {
        setItems((current) =>
          current
            .map((item) => (item.id === id && item.selectedSize === selectedSize ? { ...item, quantity: item.quantity + delta } : item))
            .filter((item) => item.quantity > 0)
        );
      },
      reorderItems(orderItems) {
        setItems((current) => {
          const next = [...current];
          orderItems.forEach((orderItem) => {
            const existing = next.find((item) => item.id === orderItem.productId && item.selectedSize === orderItem.selectedSize);
            if (existing) {
              existing.quantity += orderItem.quantity;
              return;
            }
            next.push({
              id: orderItem.productId,
              name: orderItem.name,
              description: "Previously ordered item",
              category: "reorder",
              subcategory: "buy-again",
              price: orderItem.price,
              imageUrl: orderItem.imageUrl,
              imageUrls: [orderItem.imageUrl],
              sizes: orderItem.selectedSize ? [orderItem.selectedSize] : [],
              stock: 99,
              featured: false,
              selectedSize: orderItem.selectedSize,
              quantity: orderItem.quantity
            });
          });
          return next;
        });
        showToast({
          title: "Added to cart",
          message: `${orderItems.length} previous item${orderItems.length === 1 ? "" : "s"} added to your cart.`,
          tone: "success"
        });
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
  }, [items, showToast, wishlistItems]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used inside CartProvider");
  }
  return context;
}
