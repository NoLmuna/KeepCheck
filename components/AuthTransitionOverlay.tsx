"use client";

import { memo } from "react";
import Image from "next/image";

export type AuthActionState = "signing-in" | "signing-out" | null;

interface AuthTransitionOverlayProps {
  action: AuthActionState;
}

const AuthTransitionOverlay = memo(function AuthTransitionOverlay({
  action,
}: AuthTransitionOverlayProps) {
  if (!action) return null;

  const isSigningIn = action === "signing-in";

  return (
    <aside
      aria-label={isSigningIn ? "Signing in" : "Signing out"}
      aria-live="polite"
      className="fixed inset-0 z-[9990] flex items-center justify-center bg-stone-900/35 dark:bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 animate-page-enter px-4 select-none"
    >
      <div className="w-full max-w-xs bg-white dark:bg-stone-900 rounded-3xl p-6 shadow-2xl border border-stone-200/90 dark:border-stone-800 flex flex-col items-center text-center gap-4">
        {/* Brand logo container with smooth pulse ring */}
        <div className="relative">
          <div className="w-14 h-14 rounded-2xl bg-[#F8F6F2] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center shadow-xs overflow-hidden">
            <Image
              src="/KeepCheck-Logo.png"
              alt="KeepCheck"
              width={40}
              height={40}
              className="object-contain p-0.5"
              priority
            />
          </div>
          <div className="absolute -inset-1 rounded-2xl bg-amber-500/20 dark:bg-amber-400/20 animate-pulse pointer-events-none" />
        </div>

        {/* Text descriptions */}
        <div className="space-y-1">
          <h3 className="font-serif font-bold text-base text-stone-900 dark:text-white">
            {isSigningIn ? "Signing in to KeepCheck" : "Signing out"}
          </h3>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {isSigningIn
              ? "Connecting to your Google account…"
              : "Safely securing your local journal…"}
          </p>
        </div>

        {/* Smooth micro-spinner */}
        <div className="flex items-center gap-2 pt-1">
          <div className="w-4 h-4 border-2 border-amber-600/30 border-t-amber-700 dark:border-t-amber-400 rounded-full animate-spin" />
          <span className="text-[11px] font-semibold text-stone-600 dark:text-stone-300">
            Please wait a moment…
          </span>
        </div>
      </div>
    </aside>
  );
});

export default AuthTransitionOverlay;
