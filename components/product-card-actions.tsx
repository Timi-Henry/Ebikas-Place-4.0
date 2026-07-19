"use client";

import { Heart, PackageX, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/cart-provider";
import type { Product, ProductSize } from "@/lib/types";

export type ProductCardActionProduct = Pick<Product, "id" | "name" | "imageUrl" | "price" | "stock"> & {
  salePrice?: number;
  sizes?: ProductSize[];
};

function toCartProduct(product: ProductCardActionProduct): Product {
  return {
    ...product,
    description: "",
    category: "",
    subcategory: "",
    featured: false
  };
}

export function ProductCardActions({ product }: { product: ProductCardActionProduct }) {
  const router = useRouter();
  const { addItem, isWishlisted, toggleWishlist } = useCart();
  const wishlisted = isWishlisted(product.id);
  const needsSize = Boolean(product.sizes?.length);
  const soldOut = product.stock <= 0;

  function openProductOrAddToCart() {
    if (soldOut) return;
    if (needsSize) {
      router.push(`/products/${product.id}`);
      return;
    }
    addItem(toCartProduct(product));
  }

  return (
    <>
      <button
        className={`product-fav ${wishlisted ? "active" : ""}`}
        type="button"
        onClick={() => toggleWishlist(toCartProduct(product))}
        aria-label={`${wishlisted ? "Remove" : "Save"} ${product.name} ${wishlisted ? "from" : "to"} wishlist`}
      >
        <Heart size={16} fill={wishlisted ? "currentColor" : "none"} />
      </button>
      <button
        className="add-to-cart-btn"
        disabled={soldOut}
        type="button"
        onClick={openProductOrAddToCart}
        aria-label={soldOut ? `${product.name} is sold out` : needsSize ? `Choose a size for ${product.name}` : `Add ${product.name} to cart`}
      >
        {soldOut ? <PackageX size={18} /> : <Plus size={18} />}
        <span>{soldOut ? "Sold out" : needsSize ? "Select size" : "Add to bag"}</span>
      </button>
    </>
  );
}
