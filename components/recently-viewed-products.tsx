"use client";

import { useEffect, useMemo, useState } from "react";
import { ProductBrowser } from "@/components/product-browser";
import type { Product } from "@/lib/types";

const storageKey = "ebikas-recent-products-v1";

export function RecentlyViewedProducts({ currentProduct, products }: { currentProduct: Product; products: Product[] }) {
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    let ids: string[] = [];
    try {
      const saved = window.localStorage.getItem(storageKey);
      const parsed = saved ? JSON.parse(saved) : [];
      ids = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
    } catch {
      ids = [];
    }
    const nextIds = [currentProduct.id, ...ids.filter((id) => id !== currentProduct.id)].slice(0, 12);
    window.localStorage.setItem(storageKey, JSON.stringify(nextIds));
    setRecentIds(nextIds.filter((id) => id !== currentProduct.id));
  }, [currentProduct.id]);

  const recentProducts = useMemo(() => {
    const byId = new Map(products.map((product) => [product.id, product]));
    return recentIds.map((id) => byId.get(id)).filter((product): product is Product => Boolean(product));
  }, [products, recentIds]);

  if (recentProducts.length === 0) return null;

  return (
    <ProductBrowser
      products={recentProducts}
      title="Recently viewed"
      eyebrow="Keep browsing"
      showControls={false}
      compact
      productLimit={6}
      ctaHref="/shop"
      ctaLabel="Continue shopping"
    />
  );
}
