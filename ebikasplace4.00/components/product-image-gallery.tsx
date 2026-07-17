"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { Product } from "@/lib/types";

export function ProductImageGallery({ product }: { product: Product }) {
  const images = useMemo(() => {
    const allImages = [product.imageUrl, ...(product.imageUrls || [])].filter(Boolean);
    return [...new Set(allImages)].slice(0, 8);
  }, [product.imageUrl, product.imageUrls]);
  const [activeImage, setActiveImage] = useState(images[0] || product.imageUrl);

  return (
    <div className="product-detail-media glass-card reveal">
      {product.featured ? <span className="product-badge">Featured</span> : null}
      <span className="product-detail-main-image">
        <Image
          src={activeImage}
          alt={product.name}
          fill
          priority
          sizes="(max-width: 900px) 92vw, 52vw"
        />
      </span>
      {images.length > 1 ? (
        <div className="product-thumbnails">
          {images.map((imageUrl, index) => (
            <button
              className={activeImage === imageUrl ? "active" : ""}
              type="button"
              onClick={() => setActiveImage(imageUrl)}
              aria-label={`Show product image ${index + 1}`}
              key={imageUrl}
            >
              <Image src={imageUrl} alt="" width={76} height={88} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
