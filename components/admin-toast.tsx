"use client";

import { AlertTriangle, CheckCircle2, RefreshCw, X } from "lucide-react";
import type { CloudinaryCleanupResult } from "@/lib/types";

export type AdminToastData = {
  tone: "success" | "warning" | "error";
  title: string;
  message: string;
  details?: string[];
  retryPublicIds?: string[];
};

export function buildCloudinaryCleanupToast(cleanup: CloudinaryCleanupResult | undefined, context: string): AdminToastData | null {
  if (!cleanup) return null;

  if (cleanup.failed.length > 0) {
    return {
      tone: "error",
      title: "Cloudinary cleanup needs attention",
      message: `${context} worked, but ${cleanup.failed.length} Cloudinary image${cleanup.failed.length === 1 ? "" : "s"} could not be deleted.`,
      details: cleanup.failed.flatMap((issue) => [
        `${issue.publicId}: ${issue.message}`,
        `Fix: ${issue.suggestion}`,
        `Tried: ${issue.attemptedPublicIds.join(", ")}`
      ]),
      retryPublicIds: cleanup.failed.map((issue) => issue.publicId)
    };
  }

  if (cleanup.recovered.length > 0) {
    return {
      tone: "warning",
      title: "Cloudinary cleanup recovered",
      message: `${context} worked. Cloudinary cleanup succeeded after fixing stored public ID formatting.`,
      details: cleanup.recovered.map((item) => `${item.publicId} -> ${item.usedPublicId}`)
    };
  }

  return null;
}

export async function retryCloudinaryCleanup(publicIds: string[]) {
  const response = await fetch("/api/cloudinary/cleanup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicIds })
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Cloudinary cleanup retry failed.");
  }

  return data.cloudinaryCleanup as CloudinaryCleanupResult;
}

export function AdminToast({
  toast,
  retrying = false,
  onClose,
  onRetry
}: {
  toast: AdminToastData | null;
  retrying?: boolean;
  onClose: () => void;
  onRetry?: () => void;
}) {
  if (!toast) return null;

  const isSuccess = toast.tone === "success";

  return (
    <aside className={`admin-toast ${toast.tone}`} role="alert" aria-live="assertive">
      <div className="admin-toast-icon" aria-hidden="true">
        {isSuccess ? <CheckCircle2 size={19} /> : <AlertTriangle size={19} />}
      </div>
      <div>
        <strong>{toast.title}</strong>
        <p>{toast.message}</p>
        {toast.details?.length ? (
          <ul>
            {toast.details.slice(0, 6).map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        ) : null}
        <div className="admin-toast-actions">
          {toast.retryPublicIds?.length && onRetry ? (
            <button className="secondary-button" type="button" onClick={onRetry} disabled={retrying}>
              <RefreshCw size={15} />
              {retrying ? "Retrying" : "Retry cleanup"}
            </button>
          ) : null}
          <button className="secondary-button" type="button" onClick={onClose}>
            <X size={15} />
            Dismiss
          </button>
        </div>
      </div>
    </aside>
  );
}
