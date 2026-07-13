"use client";

export default function RetryButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="mt-8 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 cursor-pointer min-h-[44px]"
    >
      Try Again
    </button>
  );
}
