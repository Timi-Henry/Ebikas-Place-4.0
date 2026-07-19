import type { ProductSize } from "@/lib/types";

export const CART_STORAGE_KEY = "ebikas-cart:v3";
export const WISHLIST_STORAGE_KEY = "ebikas-wishlist:v2";
export const LEGACY_CART_STORAGE_KEY = "ebikas-cart-v2";
export const LEGACY_WISHLIST_STORAGE_KEY = "ebikas-wishlist-v1";

export type StoredCartLine = { productId: string; quantity: number; selectedSize?: ProductSize };

const productSizes = new Set<ProductSize>(["S", "M", "L", "XL", "XXL"]);

function parseStoredLine(value: unknown): StoredCartLine | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const productId = String(record.productId || record.id || "").trim();
  const quantity = Number(record.quantity);
  const selectedSize =
    typeof record.selectedSize === "string" && productSizes.has(record.selectedSize as ProductSize)
      ? (record.selectedSize as ProductSize)
      : undefined;
  if (!/^[a-f\d]{24}$/i.test(productId) || !Number.isInteger(quantity) || quantity < 1) return null;
  return { productId, quantity: Math.min(quantity, 10), selectedSize };
}

export function decodeCartStorage(currentValue: string | null, legacyValue: string | null): StoredCartLine[] {
  try {
    if (currentValue) {
      const parsed = JSON.parse(currentValue) as { version?: unknown; lines?: unknown };
      if (parsed?.version === 3 && Array.isArray(parsed.lines)) {
        return parsed.lines.map(parseStoredLine).filter((line): line is StoredCartLine => Boolean(line));
      }
    }

    const parsedLegacy = legacyValue ? JSON.parse(legacyValue) : [];
    return Array.isArray(parsedLegacy)
      ? parsedLegacy.map(parseStoredLine).filter((line): line is StoredCartLine => Boolean(line))
      : [];
  } catch {
    return [];
  }
}

export function encodeCartStorage(lines: readonly StoredCartLine[]) {
  return JSON.stringify({ version: 3, lines });
}

export function decodeWishlistStorage(currentValue: string | null, legacyValue: string | null): string[] {
  try {
    if (currentValue) {
      const parsed = JSON.parse(currentValue) as { version?: unknown; productIds?: unknown };
      if (parsed?.version === 2 && Array.isArray(parsed.productIds)) {
        return parsed.productIds.filter(
          (id): id is string => typeof id === "string" && /^[a-f\d]{24}$/i.test(id)
        );
      }
    }

    const parsedLegacy = legacyValue ? JSON.parse(legacyValue) : [];
    return Array.isArray(parsedLegacy)
      ? parsedLegacy
          .map((item) => (item && typeof item === "object" ? String((item as { id?: unknown }).id || "") : ""))
          .filter((id): id is string => /^[a-f\d]{24}$/i.test(id))
      : [];
  } catch {
    return [];
  }
}

export function encodeWishlistStorage(productIds: readonly string[]) {
  return JSON.stringify({ version: 2, productIds });
}

