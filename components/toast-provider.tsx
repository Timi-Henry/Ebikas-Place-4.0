"use client";

import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type ToastTone = "success" | "info" | "warning" | "error";

type ToastInput = {
  title: string;
  message?: string;
  tone?: ToastTone;
  durationMs?: number;
};

type ToastItem = Required<Omit<ToastInput, "durationMs">> & {
  id: string;
  durationMs: number;
};

type ToastContextValue = {
  showToast: (toast: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function createToastId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ToastIcon({ tone }: { tone: ToastTone }) {
  if (tone === "error" || tone === "warning") return <AlertTriangle size={18} />;
  if (tone === "info") return <Info size={18} />;
  return <CheckCircle2 size={18} />;
}

function StoreToast({ toast, onClose }: { toast: ToastItem; onClose: (id: string) => void }) {
  useEffect(() => {
    const timeout = window.setTimeout(() => onClose(toast.id), toast.durationMs);
    return () => window.clearTimeout(timeout);
  }, [onClose, toast.durationMs, toast.id]);

  return (
    <article className={`store-toast ${toast.tone}`} role="status" aria-live="polite">
      <div className="store-toast-icon" aria-hidden="true">
        <ToastIcon tone={toast.tone} />
      </div>
      <div>
        <strong>{toast.title}</strong>
        {toast.message ? <p>{toast.message}</p> : null}
      </div>
      <button type="button" onClick={() => onClose(toast.id)} aria-label="Dismiss notification">
        <X size={15} />
      </button>
    </article>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((toast: ToastInput) => {
    const nextToast: ToastItem = {
      id: createToastId(),
      title: toast.title,
      message: toast.message || "",
      tone: toast.tone || "success",
      durationMs: toast.durationMs || 3600
    };

    setToasts((current) => [nextToast, ...current].slice(0, 4));
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="store-toast-stack" aria-label="Notifications">
        {toasts.map((toast) => (
          <StoreToast toast={toast} onClose={dismissToast} key={toast.id} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}
