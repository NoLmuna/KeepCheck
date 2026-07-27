"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { Trash2, AlertTriangle, Info, CheckCircle2, X } from "lucide-react";

export type ToastType = "success" | "delete" | "info" | "error";

export interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
  icon?: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, icon?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback(
    (message: string, type: ToastType = "success", icon?: string) => {
      const id = Date.now() + Math.random();
      const newToast: ToastMessage = { id, message, type, icon };

      setToasts((prev) => [...prev.slice(-2), newToast]); // Keep max 3 visible

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3500);
    },
    []
  );

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast Notification Container */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 max-w-sm sm:max-w-md w-full px-4 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 px-5 py-3 rounded-2xl text-xs sm:text-sm font-semibold shadow-neu-raised backdrop-blur-md animate-page-enter transition-all w-full border ${
              toast.type === "success"
                ? "bg-bg/95 border-category-cafe/40 text-text-primary"
                : toast.type === "delete"
                ? "bg-bg/95 border-red-500/30 text-red-500"
                : toast.type === "error"
                ? "bg-bg/95 border-red-500/40 text-red-500"
                : "bg-bg/95 border-accent/40 text-text-primary"
            }`}
          >
            {toast.icon ? (
              <span className="text-base">{toast.icon}</span>
            ) : toast.type === "delete" ? (
              <Trash2 className="h-4 w-4 text-red-500 shrink-0" />
            ) : toast.type === "error" ? (
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
            ) : toast.type === "info" ? (
              <Info className="h-4 w-4 text-accent shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-category-cafe shrink-0" />
            )}
            <span className="flex-1 truncate">{toast.message}</span>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="text-text-secondary/50 hover:text-text-primary cursor-pointer p-0.5 shrink-0"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: (msg) => console.log("[Toast fallback]:", msg),
    };
  }
  return ctx;
}
