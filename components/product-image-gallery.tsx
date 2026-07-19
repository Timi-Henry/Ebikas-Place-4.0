"use client";

import Image from "next/image";
import { Expand, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { Product } from "@/lib/types";

export function ProductImageGallery({ product }: { product: Product }) {
  const images = useMemo(() => {
    const allImages = [product.imageUrl, ...(product.imageUrls || [])].filter(Boolean);
    return [...new Set(allImages)].slice(0, 8);
  }, [product.imageUrl, product.imageUrls]);
  const [selectedImage, setSelectedImage] = useState(images[0] || product.imageUrl);
  const zoomDialogRef = useRef<HTMLDialogElement>(null);
  const activeImage = images.includes(selectedImage) ? selectedImage : images[0] || product.imageUrl;
  const activeIndex = Math.max(0, images.indexOf(activeImage));

  return (
    <div className="product-detail-media glass-card">
      <div className="product-gallery-layout">
        {images.length > 1 ? (
          <div className="product-thumbnails" aria-label="Product views" role="group">
            <span className="product-gallery-count" aria-live="polite">
              {String(activeIndex + 1).padStart(2, "0")} / {String(images.length).padStart(2, "0")}
            </span>
            {images.map((imageUrl, index) => (
              <button
                aria-label={`Show product image ${index + 1}`}
                aria-pressed={activeImage === imageUrl}
                className={activeImage === imageUrl ? "active" : ""}
                key={imageUrl}
                type="button"
                onClick={() => setSelectedImage(imageUrl)}
              >
                <Image src={imageUrl} alt="" width={76} height={88} />
              </button>
            ))}
          </div>
        ) : null}
        <div className="product-gallery-stage">
          {product.featured ? <span className="product-badge">Featured</span> : null}
          <button
            className="product-detail-main-image"
            type="button"
            aria-label={`Open a larger view of ${product.name}`}
            onClick={() => zoomDialogRef.current?.showModal()}
          >
            <Image
              key={activeImage}
              src={activeImage}
              alt={product.name}
              fill
              priority
              sizes="(max-width: 900px) 94vw, (max-width: 1240px) 55vw, 42vw"
            />
          </button>
          <span className="product-gallery-expand" aria-hidden="true">
            <Expand size={15} /> View larger
          </span>
        </div>
      </div>
      <dialog
        aria-label={`Larger view of ${product.name}`}
        className="product-image-dialog"
        ref={zoomDialogRef}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <button
          className="product-image-dialog-close"
          type="button"
          aria-label="Close larger product image"
          onClick={() => zoomDialogRef.current?.close()}
        >
          <X size={20} />
        </button>
        <div className="product-image-dialog-stage">
          <Image src={activeImage} alt={product.name} fill sizes="92vw" />
        </div>
      </dialog>
    </div>
  );
}
