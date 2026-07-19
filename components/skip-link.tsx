"use client";

export function SkipLink() {
  return (
    <a
      className="skip-link"
      href="#main-content"
      onClick={() => {
        window.requestAnimationFrame(() => {
          document.getElementById("main-content")?.focus({ preventScroll: true });
        });
      }}
    >
      Skip to main content
    </a>
  );
}

