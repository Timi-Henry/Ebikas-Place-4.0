"use client";

import { useEffect, useRef } from "react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function useOverlayDialog<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const dialogRef = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const currentDialog = dialogRef.current;
    if (!currentDialog) return;
    const dialog: T = currentDialog;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const getFocusable = () =>
      [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter(
        (element) => element.getAttribute("aria-hidden") !== "true" && element.offsetParent !== null
      );

    const frame = window.requestAnimationFrame(() => {
      (dialog.querySelector<HTMLElement>("[data-dialog-close]") || getFocusable()[0] || dialog).focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      const eventTarget = event.target instanceof Element ? event.target : null;
      const nestedModal = eventTarget?.closest<HTMLElement>('[role="dialog"][aria-modal="true"]');
      if (nestedModal && nestedModal !== dialog && !dialog.contains(nestedModal)) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  return dialogRef;
}
