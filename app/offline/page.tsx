import type { Metadata } from "next";
import RetryButton from "./RetryButton";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Offline – KeepCheck",
  description: "This page is not available offline.",
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      {/* Icon */}
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-surface border border-text-secondary/25 shadow-sm">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-text-secondary"
        >
          {/* Wi-Fi off icon */}
          <path d="M12 20h.01" />
          <path d="M8.5 16.429a5 5 0 0 1 7 0" />
          <path d="M5 12.859a10 10 0 0 1 5.17-2.69" />
          <path d="M13.83 10.17A10 10 0 0 1 19 12.86" />
          <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
          <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
          <line x1="2" y1="2" x2="22" y2="22" />
        </svg>
      </div>

      {/* Heading */}
      <h1 className="text-2xl font-serif font-bold tracking-tight text-text-primary sm:text-3xl">
        You&apos;re Offline
      </h1>

      {/* Description */}
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-text-secondary sm:text-base">
        This page hasn&apos;t been loaded before and needs a network connection
        for its first visit. Please reconnect and try again.
      </p>

      {/* Try again button */}
      <RetryButton />

      {/* Branding */}
      <p className="mt-12 text-xs font-serif text-text-secondary/60">
        Keep<span className="text-accent font-bold">Check</span>
      </p>
    </div>
  );
}
