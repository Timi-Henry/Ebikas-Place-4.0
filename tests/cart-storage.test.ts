import { describe, expect, it } from "vitest";
import {
  decodeCartStorage,
  decodeWishlistStorage,
  encodeCartStorage,
  encodeWishlistStorage
} from "@/lib/cart-storage";

const PRODUCT_ID = "64b000000000000000000001";

describe("cart storage codec", () => {
  it("stores only versioned product references, sizes, and quantities", () => {
    const encoded = encodeCartStorage([{ productId: PRODUCT_ID, selectedSize: "M", quantity: 2 }]);
    expect(JSON.parse(encoded)).toEqual({
      version: 3,
      lines: [{ productId: PRODUCT_ID, selectedSize: "M", quantity: 2 }]
    });
    expect(encoded).not.toContain("price");
    expect(encoded).not.toContain("imageUrl");
  });

  it("migrates valid legacy full-product cart entries to minimal lines", () => {
    const legacy = JSON.stringify([
      {
        id: PRODUCT_ID,
        name: "Old snapshot",
        price: 1,
        imageUrl: "https://example.com/old.jpg",
        selectedSize: "L",
        quantity: 3
      }
    ]);
    expect(decodeCartStorage(null, legacy)).toEqual([
      { productId: PRODUCT_ID, selectedSize: "L", quantity: 3 }
    ]);
  });

  it("rejects malformed entries and caps restored quantities", () => {
    const current = JSON.stringify({
      version: 3,
      lines: [
        { productId: PRODUCT_ID, quantity: 999, selectedSize: "M" },
        { productId: "sample-product", quantity: 1 },
        { productId: PRODUCT_ID, quantity: 0 }
      ]
    });
    expect(decodeCartStorage(current, null)).toEqual([
      { productId: PRODUCT_ID, selectedSize: "M", quantity: 10 }
    ]);
  });

  it("fails closed on invalid JSON", () => {
    expect(decodeCartStorage("{", null)).toEqual([]);
    expect(decodeWishlistStorage("not-json", null)).toEqual([]);
  });

  it("versions wishlist IDs and migrates legacy product snapshots", () => {
    const encoded = encodeWishlistStorage([PRODUCT_ID]);
    expect(JSON.parse(encoded)).toEqual({ version: 2, productIds: [PRODUCT_ID] });
    expect(decodeWishlistStorage(null, JSON.stringify([{ id: PRODUCT_ID, name: "Old" }]))).toEqual([PRODUCT_ID]);
  });
});

