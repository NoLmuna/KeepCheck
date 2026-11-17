"use client";

import { useState } from "react";
import Image from "next/image";
import {
  MapPin,
  Coffee,
  Star,
  Wifi,
  ArrowRight,
  Bookmark,
  Footprints,
  Check,
  X,
  Compass,
  Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import ThemeToggle from "./ThemeToggle";

/* ------------------------------------------------------------------ */
/*  Official Google "G" Icon SVG                                       */
/* ------------------------------------------------------------------ */
export function GoogleIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function LandingPage() {
  const { signInWithGoogle, continueAsGuest, quickLoginAccounts } = useAuth();
  const { showToast } = useToast();
  const [signingIn, setSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleGoogleSignIn(emailHint?: string) {
    setSigningIn(true);
    setErrorMessage(null);
    try {
      await signInWithGoogle(emailHint);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google sign-in failed. Please try again.";
      if (msg !== "Sign-in cancelled.") {
        setErrorMessage(msg);
        showToast(msg, "error");
      }
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#FAF7F2] dark:bg-[#15110F] text-[#2C221E] dark:text-[#F8F4EE] selection:bg-amber-100 dark:selection:bg-amber-950/60 transition-colors">
      {/* ------------------------------------------------------------------ */}
      {/*  Top Navigation Bar (Clean single-focus: no duplicate Sign in button) */}
      {/* ------------------------------------------------------------------ */}
      <header className="sticky top-0 z-30 w-full h-15 bg-[#FAF7F2]/90 dark:bg-[#15110F]/90 backdrop-blur-md border-b border-stone-200/70 dark:border-stone-800/80 px-4 sm:px-8 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 rounded-xl overflow-hidden shadow-2xs border border-stone-200/90 dark:border-stone-700 bg-white dark:bg-stone-900 flex items-center justify-center">
            <Image
              src="/KeepCheck-Logo.png"
              alt="KeepCheck logo"
              width={32}
              height={32}
              className="object-contain p-0.5"
              priority
            />
          </div>
          <span className="font-serif font-bold text-xl tracking-tight text-[#2C221E] dark:text-[#F8F4EE]">
            KeepCheck
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Light / Dark Mode Toggle */}
          <ThemeToggle />
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/*  Hero & Interactive Showcase Section (Fits above fold)             */}
      {/* ------------------------------------------------------------------ */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-6 sm:py-8 lg:py-10 max-w-6xl mx-auto w-full">
        {/* Core Hero Copy */}
        <div className="w-full text-center flex flex-col items-center max-w-3xl mb-8 sm:mb-10">
          <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#2C221E] dark:text-white leading-[1.12]">
            Never forget what to order, or where that hidden café was.
          </h1>

          <p className="mt-4 text-sm sm:text-base lg:text-lg text-[#6B5B52] dark:text-[#BCAFA2] max-w-2xl leading-relaxed">
            Your personal food and coffee notebook. Save favorite spots, remember the dishes you loved, and explore new places on the map — even when you have no signal.
          </p>

          {/* Central Authentication Card */}
          <div className="mt-6 flex flex-col items-center gap-2.5 w-full max-w-xs sm:max-w-sm">
            {quickLoginAccounts.length > 0 && !signingIn ? (
              <div className="w-full flex flex-col gap-2">
                {quickLoginAccounts.slice(0, 1).map((acc) => (
                  <div key={acc.uid} className="flex flex-col items-center gap-1.5 w-full">
                    <button
                      type="button"
                      onClick={() => handleGoogleSignIn(acc.email ?? undefined)}
                      className="flex items-center gap-3 w-full p-2.5 bg-white dark:bg-[#1E1815] hover:bg-stone-50 dark:hover:bg-[#28201B] border border-stone-300/80 dark:border-stone-700 rounded-xl shadow-2xs transition-all text-left cursor-pointer group"
                    >
                      {acc.photoURL ? (
                        <img
                          src={acc.photoURL}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover ring-1 ring-amber-400"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 font-bold text-xs flex items-center justify-center">
                          {(acc.displayName?.[0] ?? acc.email?.[0] ?? "U").toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">
                          Continue as {acc.displayName ?? "User"}
                        </p>
                        <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">{acc.email}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-stone-400 group-hover:text-amber-700 dark:group-hover:text-amber-400 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGoogleSignIn()}
                      className="text-xs text-[#6B5B52] dark:text-[#BCAFA2] hover:text-stone-900 dark:hover:text-stone-100 underline cursor-pointer"
                    >
                      Use another account
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <button
                onClick={() => handleGoogleSignIn()}
                disabled={signingIn}
                className="w-full inline-flex items-center justify-center gap-3 px-5 py-3 bg-white dark:bg-[#1E1815] text-[#2C221E] dark:text-white font-semibold rounded-xl border border-stone-300/90 dark:border-stone-700 shadow-xs hover:shadow-sm hover:bg-stone-50 dark:hover:bg-[#28201B] active:scale-[0.99] transition-all cursor-pointer text-sm sm:text-base disabled:opacity-60"
              >
                {signingIn ? (
                  <>
                    <div className="w-4 h-4 border-2 border-stone-300 border-t-amber-700 rounded-full animate-spin" />
                    <span>Connecting with Google…</span>
                  </>
                ) : (
                  <>
                    <GoogleIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span>Continue with Google</span>
                  </>
                )}
              </button>
            )}

            {errorMessage && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-2 w-full text-center">
                {errorMessage}
              </p>
            )}

            <button
              onClick={() => continueAsGuest()}
              className="text-xs text-[#6B5B52] dark:text-[#BCAFA2] hover:text-[#2C221E] dark:hover:text-white underline decoration-stone-300 dark:decoration-stone-600 underline-offset-4 transition-colors cursor-pointer py-0.5"
            >
              Try without an account →
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/*  Interactive Bento Showcase (Real-world Utility vs AI Grid)       */}
        {/* ------------------------------------------------------------------ */}
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 text-left">
          {/* Card 1: Rich Café Memory Card (7 cols) */}
          <div className="lg:col-span-7 bg-white dark:bg-[#1E1815] rounded-2xl p-4 sm:p-5 border border-stone-200/80 dark:border-stone-800 shadow-xs space-y-3.5 transition-all">
            {/* Header / Venue info */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 flex items-center justify-center shrink-0">
                  <Coffee className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-serif font-bold text-base sm:text-lg text-stone-900 dark:text-white leading-snug">
                      Yardstick Coffee
                    </h3>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-200 bg-amber-100/70 dark:bg-amber-950/80 px-2 py-0.5 rounded-full">
                      Visited
                    </span>
                  </div>
                  <p className="text-xs text-[#6B5B52] dark:text-[#BCAFA2] flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-amber-700 dark:text-amber-500 shrink-0" />
                    <span>Legaspi Village, Makati · 250 m away</span>
                  </p>
                </div>
              </div>

              <div className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-200/80 dark:border-amber-800/60 px-2.5 py-1 rounded-full text-xs font-bold tabular-nums">
                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                <span>4.8</span>
              </div>
            </div>

            {/* Menu Memory: Must Order vs Skip */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center gap-2 text-xs p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/50 text-emerald-950 dark:text-emerald-200">
                <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                  ✓
                </span>
                <span className="font-semibold">Must Order:</span>
                <span className="truncate">Golden Ticket Latte & Sea Salt Cookie</span>
              </div>

              <div className="flex items-center gap-2 text-xs p-2 rounded-xl bg-stone-100 dark:bg-stone-800/60 border border-stone-200/70 dark:border-stone-700 text-stone-700 dark:text-stone-300">
                <span className="w-4 h-4 rounded-full bg-stone-400 dark:bg-stone-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                  ✕
                </span>
                <span className="font-semibold text-stone-600 dark:text-stone-400">Skip:</span>
                <span className="truncate">Standard batch brew (too acidic on quiet days)</span>
              </div>
            </div>

            {/* Practical Vibe Tags */}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 px-2.5 py-1 rounded-lg">
                <Wifi className="w-3 h-3 text-stone-500 dark:text-stone-400" />
                Fast Wi-Fi
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 px-2.5 py-1 rounded-lg">
                <Zap className="w-3 h-3 text-stone-500 dark:text-stone-400" />
                Power Outlets
              </span>
              <span className="text-[11px] font-medium bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 px-2.5 py-1 rounded-lg">
                Quiet Study
              </span>
              <span className="text-[11px] font-medium bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 px-2.5 py-1 rounded-lg">
                ₱₱
              </span>
            </div>

            {/* Personal Visit Note */}
            <div className="pt-2 border-t border-stone-100 dark:border-stone-800/80 flex items-center justify-between text-xs text-[#6B5B52] dark:text-[#BCAFA2]">
              <p className="italic line-clamp-1">
                “Window nook has morning sun. Perfect for reading before noon.”
              </p>
              <span className="text-[11px] shrink-0 font-medium ml-2 text-stone-400">
                Yesterday
              </span>
            </div>
          </div>

          {/* Card 2: City Discovery & Walking Route (5 cols) */}
          <div className="lg:col-span-5 bg-white dark:bg-[#1E1815] rounded-2xl p-4 sm:p-5 border border-stone-200/80 dark:border-stone-800 shadow-xs flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 flex items-center justify-center">
                    <Compass className="w-4 h-4 text-amber-800 dark:text-amber-400" />
                  </div>
                  <span className="font-serif font-bold text-sm text-stone-900 dark:text-white">
                    Walking Route
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/60 border border-amber-200/80 dark:border-amber-800/60 px-2 py-0.5 rounded-full">
                  <Footprints className="w-3 h-3" />
                  3 min walk
                </span>
              </div>

              {/* Stylized Route Map Canvas */}
              <div className="h-28 bg-[#F4EFEB] dark:bg-[#28201B] rounded-xl relative overflow-hidden flex items-center justify-center border border-stone-200/70 dark:border-stone-700/60">
                <div className="absolute inset-0 opacity-25 bg-[linear-gradient(to_right,#a8a29e_1px,transparent_1px),linear-gradient(to_bottom,#a8a29e_1px,transparent_1px)] bg-[size:16px_16px]" />
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 160 100" fill="none">
                  <path
                    d="M 25 80 Q 75 65 85 45 T 135 25"
                    stroke="#D97706"
                    strokeWidth="3.5"
                    strokeDasharray="4 3"
                    opacity="0.9"
                  />
                </svg>

                <div className="relative z-10 flex items-center justify-between w-full px-6">
                  {/* Origin: GPS Dot */}
                  <div className="flex flex-col items-center">
                    <div className="w-3.5 h-3.5 rounded-full bg-blue-600 ring-4 ring-blue-500/20" />
                    <span className="text-[10px] font-semibold text-stone-600 dark:text-stone-300 mt-1">You</span>
                  </div>

                  {/* Destination: Café Pin */}
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-amber-700 text-white flex items-center justify-center shadow-md ring-4 ring-amber-600/20">
                      <Coffee className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-bold text-stone-800 dark:text-stone-100 mt-1">Yardstick</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Want to Try Quick Queue */}
            <div className="pt-2 border-t border-stone-100 dark:border-stone-800/80 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
                <span>Want to Try List</span>
                <span className="text-indigo-600 dark:text-indigo-400 font-semibold">2 saved</span>
              </div>
              <div className="flex items-center gap-2 p-1.5 rounded-lg bg-stone-50 dark:bg-stone-800/50 text-xs">
                <Bookmark className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span className="font-semibold text-stone-800 dark:text-stone-200 truncate">El Union Coffee</span>
                <span className="text-stone-400 text-[11px] truncate">· Recommended for dirty horchata</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ------------------------------------------------------------------ */}
      {/*  Footer                                                            */}
      {/* ------------------------------------------------------------------ */}
      <footer className="w-full border-t border-stone-200/60 dark:border-stone-800/80 py-4 px-4 text-center text-xs text-[#6B5B52] dark:text-[#BCAFA2]">
        <p>KeepCheck — Personal culinary notebook for the places and dishes you love.</p>
      </footer>
    </div>
  );
}
