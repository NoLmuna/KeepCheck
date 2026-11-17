"use client";

export default function RetryButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="mt-8 rounded-xl bg-gold px-6 py-3 text-sm font-bold text-[#4E342E] transition-all hover:bg-gold/90 active:scale-95 cursor-pointer min-h-[44px] shadow-neu-button"
    >
      Try Again
    </button>
  );
}
