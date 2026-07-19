"use client";

import { useEffect } from "react";

export function StoreEffects() {
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealElements = () => document.querySelectorAll<HTMLElement>(".reveal:not(.visible)");
    const root = document.documentElement;

    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      revealElements().forEach((element) => element.classList.add("visible"));
      return;
    }

    revealElements().forEach((element) => {
      const bounds = element.getBoundingClientRect();
      if (bounds.top <= window.innerHeight + 36 && bounds.bottom >= -36) element.classList.add("visible");
    });
    root.classList.add("store-effects-ready");

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("visible");
          revealObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -36px 0px" }
    );

    const observeReveals = () => revealElements().forEach((element) => revealObserver.observe(element));
    observeReveals();

    const mutationObserver = new MutationObserver(observeReveals);
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      revealObserver.disconnect();
      mutationObserver.disconnect();
      root.classList.remove("store-effects-ready");
    };
  }, []);

  return null;
}
