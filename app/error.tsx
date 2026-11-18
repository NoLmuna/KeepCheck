"use client";

import { useEffect } from "react";
import Image from "next/image";
import { RotateCcw, AlertTriangle, Home } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[KeepCheck Error Boundary Caught]:", error);
  }, [error]);

  function handleResetAndClear() {
    try {
      // Clear temporary drafts and caches
      if (typeof window !== "undefined") {
        localStorage.removeItem("keepcheck-feedback-draft");
        window.location.hash = "";
      }
    } catch {
      // Ignore storage errors
    }
    // Attempt React tree recovery
    reset();
  }

  function handleHardReload() {
    try {
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    } catch {
      window.location.reload();
    }
  }

  return (
    <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center p-4 bg-[#FAF7F2] dark:bg-[#15110F] text-stone-900 dark:text-stone-100 select-none">
      <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#1C1612] border border-stone-200/90 dark:border-stone-800 p-6 shadow-2xl flex flex-col items-center text-center gap-4 animate-modal-enter">
        <div className="relative">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center justify-center shadow-xs">
            <Image
              src="/KeepCheck-Logo.png"
              alt="KeepCheck"
              width={38}
              height={38}
              className="object-contain p-0.5"
            />
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center shadow-xs">
            <AlertTriangle className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="space-y-1">
          <h2 className="font-serif font-bold text-lg text-stone-900 dark:text-white">
            Something went wrong
          </h2>
          <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
            KeepCheck encountered an unexpected display issue. Your saved spots and local journal data remain completely safe on your device.
          </p>
        </div>

        {error?.message && (
          <div className="w-full p-2.5 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-[11px] text-stone-500 dark:text-stone-400 font-mono break-all max-h-24 overflow-y-auto">
            {error.message}
          </div>
        )}

        <div className="flex flex-col w-full gap-2 pt-2">
          <button
            type="button"
            onClick={handleResetAndClear}
            className="w-full min-h-[44px] px-4 py-2.5 bg-amber-700 hover:bg-amber-800 active:bg-amber-900 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset View / Clear Draft</span>
          </button>

          <button
            type="button"
            onClick={handleHardReload}
            className="w-full min-h-[44px] px-4 py-2.5 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 text-xs font-semibold rounded-xl border border-stone-200 dark:border-stone-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>Return to Map</span>
          </button>
        </div>
      </div>
    </div>
  );
}
