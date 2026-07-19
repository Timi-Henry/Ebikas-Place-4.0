"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { Product } from "@/lib/types";

const ProductBrowser = dynamic(
  () => import("@/components/product-browser").then((module) => module.ProductBrowser),
  { ssr: false }
);

const storageKey = "ebikas-recent-products:v2";
const legacyStorageKey = "ebikas-recent-products-v1";

function readRecentIds() {
  try {
    const saved = window.localStorage.getItem(storageKey) || window.localStorage.getItem(legacyStorageKey);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string" && /^[a-f\d]{24}$/i.test(id)).slice(0, 12)
      : [];
  } catch {
    return [];
  }
}

export function RecentlyViewedProducts({ currentProductId }: { currentProductId: string }) {
  const [recentProducts, setRecentProducts] = useState<Product[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const existingIds = readRecentIds();
    const nextIds = [currentProductId, ...existingIds.filter((id) => id !== currentProductId)].slice(0, 12);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(nextIds));
      window.localStorage.removeItem(legacyStorageKey);
    } catch {
      // Recently viewed remains an optional in-memory enhancement.
    }

    const displayIds = nextIds.filter((id) => id !== currentProductId).slice(0, 6);
    if (displayIds.length === 0) return () => controller.abort();
    fetch(`/api/products?ids=${encodeURIComponent(displayIds.join(","))}`, {
      cache: "no-store",
      signal: controller.signal
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!Array.isArray(data?.products)) return;
        const byId = new Map<string, Product>(data.products.map((product: Product) => [product.id, product]));
        setRecentProducts(displayIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])));
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [currentProductId]);

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
