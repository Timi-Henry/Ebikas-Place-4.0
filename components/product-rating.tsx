"use client";

import { ChevronDown, Star } from "lucide-react";
import { useState } from "react";

export function ProductRating({
  productId,
  initialAverage = 0,
  initialCount = 0
}: {
  productId: string;
  initialAverage?: number;
  initialCount?: number;
}) {
  const [average, setAverage] = useState(initialAverage);
  const [count, setCount] = useState(initialCount);
  const [selected, setSelected] = useState(0);
  const [message, setMessage] = useState("");
  const rounded = Math.round(average);

  async function rate(rating: number) {
    setSelected(rating);
    setMessage("Saving rating...");
    const response = await fetch(`/api/products/${productId}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating })
    });
    const data = await response.json();

    if (!response.ok) {
      if (String(data.error || "").includes("database-backed")) {
        const nextCount = count + 1;
        setAverage((average * count + rating) / nextCount);
        setCount(nextCount);
        setMessage("Rating preview saved for this demo product.");
        return;
      }
      setMessage(data.error || "Could not save rating.");
      return;
    }

    setAverage(data.ratingAverage);
    setCount(data.reviewCount);
    setMessage("Thanks for rating this product.");
  }

  return (
    <div className="rating-box">
      <div className="rating-summary">
        <span className="rating-stars" aria-label={`${average.toFixed(1)} out of 5 stars`}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Star key={star} size={18} fill={star <= rounded ? "currentColor" : "none"} />
          ))}
        </span>
        <strong>{average ? average.toFixed(1) : "No ratings yet"}</strong>
        <span>{count} review{count === 1 ? "" : "s"}</span>
      </div>
      <details className="rating-entry">
        <summary>
          Rate this item
          <ChevronDown size={15} />
        </summary>
        <div className="rating-actions" role="group" aria-label="Rate this product">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              aria-label={`Rate ${star} star${star === 1 ? "" : "s"}`}
              aria-pressed={selected === star}
              className={selected >= star ? "active" : ""}
              key={star}
              type="button"
              onClick={() => rate(star)}
            >
              <Star size={20} fill="currentColor" />
            </button>
          ))}
        </div>
      </details>
      {message ? <p role="status" aria-live="polite">{message}</p> : null}
    </div>
  );
}
