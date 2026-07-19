"use client";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function ProductCarousel({
  children,
  itemCount,
  label = "featured products",
  intervalMs = 3600
}: {
  children: ReactNode;
  itemCount: number;
  label?: string;
  intervalMs?: number;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [carouselStep, setCarouselStep] = useState(0);
  const [cardsPerView, setCardsPerView] = useState(1);
  const [carouselInteracting, setCarouselInteracting] = useState(false);
  const [carouselManuallyPaused, setCarouselManuallyPaused] = useState(false);
  const [autoplayEligible, setAutoplayEligible] = useState(false);
  const maxCarouselIndex = Math.max(0, itemCount - cardsPerView);
  const canCarousel = itemCount > cardsPerView;
  const carouselPaused = carouselInteracting || carouselManuallyPaused;

  useEffect(() => {
    const measureCarousel = () => {
      const rail = railRef.current;
      const track = trackRef.current;
      const card = track?.querySelector<HTMLElement>(".product-card");
      if (!rail || !track || !card) return;

      const styles = window.getComputedStyle(track);
      const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
      const step = card.offsetWidth + gap;
      const nextCardsPerView = step > 0 ? Math.max(1, Math.floor((rail.clientWidth + gap) / step)) : 1;

      setCarouselStep(step);
      setCardsPerView(nextCardsPerView);
      setCarouselIndex((current) => Math.min(current, Math.max(0, itemCount - nextCardsPerView)));
    };

    measureCarousel();
    const observer = new ResizeObserver(measureCarousel);
    if (railRef.current) observer.observe(railRef.current);
    if (trackRef.current) observer.observe(trackRef.current);
    window.addEventListener("resize", measureCarousel);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measureCarousel);
    };
  }, [itemCount]);

  useEffect(() => {
    const carousel = railRef.current;
    if (!carousel) return;

    const desktopQuery = window.matchMedia("(min-width: 761px)");
    let isInViewport = false;

    const syncEligibility = () => {
      setAutoplayEligible(isInViewport && desktopQuery.matches && document.visibilityState === "visible");
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        isInViewport = entry?.isIntersecting === true;
        syncEligibility();
      },
      { rootMargin: "120px 0px", threshold: 0.08 }
    );

    observer.observe(carousel);
    document.addEventListener("visibilitychange", syncEligibility);
    desktopQuery.addEventListener("change", syncEligibility);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncEligibility);
      desktopQuery.removeEventListener("change", syncEligibility);
    };
  }, []);

  useEffect(() => {
    if (!canCarousel || carouselPaused || !autoplayEligible) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const interval = window.setInterval(() => {
      setCarouselIndex((current) => (current >= maxCarouselIndex ? 0 : current + 1));
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [autoplayEligible, canCarousel, carouselPaused, intervalMs, maxCarouselIndex]);

  function moveCarousel(direction: -1 | 1) {
    setCarouselIndex((current) => {
      if (direction < 0) return current <= 0 ? maxCarouselIndex : current - 1;
      return current >= maxCarouselIndex ? 0 : current + 1;
    });
  }

  return (
    <div
      className="product-carousel"
      role="region"
      aria-label={label}
      aria-roledescription="carousel"
      onMouseEnter={() => setCarouselInteracting(true)}
      onMouseLeave={() => setCarouselInteracting(false)}
      onFocusCapture={(event) => {
        const target = event.target;
        setCarouselInteracting(!(target instanceof Element && target.closest(".carousel-automation-controls")));
      }}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setCarouselInteracting(false);
        }
      }}
    >
      <button
        className="carousel-arrow carousel-arrow-left"
        type="button"
        onClick={() => moveCarousel(-1)}
        aria-label={`Previous ${label}`}
        disabled={!canCarousel}
      >
        <ChevronLeft size={22} />
      </button>
      <div className="featured-viewport" ref={railRef}>
        <div
          className="featured-track"
          ref={trackRef}
          style={{ transform: `translate3d(-${carouselIndex * carouselStep}px, 0, 0)` }}
        >
          {children}
        </div>
      </div>
      <button
        className="carousel-arrow carousel-arrow-right"
        type="button"
        onClick={() => moveCarousel(1)}
        aria-label={`Next ${label}`}
        disabled={!canCarousel}
      >
        <ChevronRight size={22} />
      </button>
      {canCarousel ? (
        <div className="carousel-automation-controls">
          <button
            aria-pressed={carouselManuallyPaused}
            type="button"
            onClick={() => setCarouselManuallyPaused((paused) => !paused)}
          >
            {carouselManuallyPaused ? <Play size={15} /> : <Pause size={15} />}
            {carouselManuallyPaused ? `Play ${label}` : `Pause ${label}`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
