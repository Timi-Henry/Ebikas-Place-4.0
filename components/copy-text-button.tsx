"use client";

import { Copy } from "lucide-react";
import { useToast } from "@/components/toast-provider";

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export function CopyTextButton({
  value,
  label,
  copiedLabel,
  className = "copy-text-button"
}: {
  value: string;
  label: string;
  copiedLabel: string;
  className?: string;
}) {
  const { showToast } = useToast();

  async function handleCopy() {
    try {
      await copyText(value);
      showToast({
        title: `${copiedLabel} copied to clipboard`,
        message: value,
        tone: "success"
      });
    } catch {
      showToast({
        title: "Copy failed",
        message: `Could not copy ${copiedLabel.toLowerCase()}.`,
        tone: "error"
      });
    }
  }

  return (
    <button className={className} type="button" onClick={handleCopy} title={`Copy ${copiedLabel}`}>
      <span>{label}</span>
      <Copy size={13} aria-hidden="true" />
    </button>
  );
}
