import type { Product } from "@/lib/types";

const nairaFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0
});

export function formatPrice(value: number) {
  return nairaFormatter.format(Math.max(0, Number.isFinite(value) ? value : 0));
}

export function getCurrentPrice(product: Pick<Product, "price" | "salePrice">) {
  return product.salePrice && product.salePrice > 0 && product.salePrice < product.price ? product.salePrice : product.price;
}

export function getCompareAtPrice(product: Pick<Product, "price" | "salePrice">) {
  return product.salePrice && product.salePrice > 0 && product.salePrice < product.price ? product.price : undefined;
}

export function getDiscountPercent(product: Pick<Product, "price" | "salePrice">) {
  const currentPrice = getCurrentPrice(product);
  const compareAt = getCompareAtPrice(product);
  if (!compareAt || compareAt <= currentPrice) return 0;
  return Math.ceil(((compareAt - currentPrice) / compareAt) * 100);
}
