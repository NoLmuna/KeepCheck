"use client";

import { useState } from "react";
import Image from "next/image";
import {
  MapPin,
  Coffee,
  Cloud,
  Star,
  Wifi,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Compass,
} from "lucide-react";
import { useAuth, type QuickLoginAccount } from "@/lib/auth";
import { useToast } from "@/lib/toast";

/* ------------------------------------------------------------------ */
/*  Official Google "G" Icon SVG                                       */
/* ------------------------------------------------------------------ */
export function GoogleIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
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
    <div className="min-h-[100dvh] flex flex-col bg-[#F8F6F2] text-stone-900 selection:bg-amber-100">
      {/* ------------------------------------------------------------------ */}
      {/*  Top Navigation Bar                                                */}
      {/* ------------------------------------------------------------------ */}
      <header className="sticky top-0 z-30 w-full h-16 bg-[#F8F6F2]/95 backdrop-blur-sm border-b border-stone-200/80 px-4 sm:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9 rounded-xl overflow-hidden shadow-xs border border-stone-200 bg-white flex items-center justify-center">
            <Image
              src="/KeepCheck-Logo.png"
              alt="KeepCheck logo"
              width={36}
              height={36}
              className="object-contain p-1"
              priority
            />
          </div>
          <span className="font-serif font-bold text-xl tracking-tight text-stone-900">
            KeepCheck
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => continueAsGuest()}
            className="hidden sm:inline-flex text-xs font-medium text-stone-600 hover:text-stone-900 px-3 py-1.5 rounded-lg hover:bg-stone-200/50 transition-colors cursor-pointer"
          >
            Offline Guest Mode
          </button>
          <button
            onClick={() => handleGoogleSignIn()}
            disabled={signingIn}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white text-stone-800 text-sm font-semibold rounded-lg border border-stone-300 shadow-xs hover:bg-stone-50 hover:border-stone-400 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
            aria-label="Sign in with Google"
          >
            <GoogleIcon className="w-4 h-4" />
            <span>Sign in</span>
          </button>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/*  Hero Section                                                      */}
      {/* ------------------------------------------------------------------ */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-16">
        <div className="w-full max-w-4xl text-center flex flex-col items-center">
          {/* Subtle Tagline Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100/80 border border-amber-200 text-amber-900 text-xs font-medium mb-6 shadow-2xs">
            <Sparkles className="w-3.5 h-3.5 text-amber-700" />
            <span>Offline-First Culinary Journal & Venue Map</span>
          </div>

          {/* Editorial Headline */}
          <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-stone-900 leading-[1.15] max-w-3xl">
            Every great coffee shop & restaurant you’ve tried—or want to try.
          </h1>

          {/* Subtitle */}
          <p className="mt-5 text-base sm:text-lg text-stone-600 max-w-2xl leading-relaxed">
            Discover nearby spots directly on an interactive map, remember what to order again,
            keep curated wishlists, and log visits even with zero cell service.
          </p>

          {/* Auth Action Stack */}
          <div className="mt-8 flex flex-col items-center gap-3 w-full max-w-sm">
            {/* Quick login rows if user signed in previously on this device */}
            {quickLoginAccounts.length > 0 && !signingIn && (
              <div className="w-full mb-1 flex flex-col gap-1.5">
                <p className="text-xs font-medium text-stone-500 text-left px-1">
                  Recent sign-in
                </p>
                {quickLoginAccounts.slice(0, 1).map((acc) => (
                  <button
                    key={acc.uid}
                    onClick={() => handleGoogleSignIn(acc.email ?? undefined)}
                    className="flex items-center gap-3 w-full p-2.5 bg-white hover:bg-stone-50 border border-stone-200 rounded-xl shadow-xs transition-all text-left cursor-pointer group"
                  >
                    {acc.photoURL ? (
                      <img
                        src={acc.photoURL}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover border border-amber-200"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-900 font-bold text-xs flex items-center justify-center">
                        {(acc.displayName?.[0] ?? acc.email?.[0] ?? "U").toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-stone-900 truncate">
                        Continue as {acc.displayName ?? "User"}
                      </p>
                      <p className="text-[11px] text-stone-500 truncate">{acc.email}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-stone-400 group-hover:text-amber-700 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                ))}
              </div>
            )}

            {/* Primary CTA Button: Continue with Google */}
            <button
              onClick={() => handleGoogleSignIn()}
              disabled={signingIn}
              className="w-full inline-flex items-center justify-center gap-3 px-6 py-3.5 bg-white text-stone-900 font-semibold rounded-xl border border-stone-300 shadow-sm hover:shadow-md hover:bg-stone-50 hover:border-stone-400 active:scale-[0.99] transition-all cursor-pointer text-base disabled:opacity-60"
            >
              {signingIn ? (
                <>
                  <div className="w-5 h-5 border-2 border-stone-300 border-t-amber-700 rounded-full animate-spin" />
                  <span>Connecting with Google…</span>
                </>
              ) : (
                <>
                  <GoogleIcon className="w-5 h-5" />
                  <span>Continue with Google</span>
                </>
              )}
            </button>

            {/* Error Message if Sign In Fails */}
            {errorMessage && (
              <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 w-full text-center">
                {errorMessage}
              </p>
            )}

            {/* Secondary Subtle Link: Offline Guest Mode */}
            <button
              onClick={() => continueAsGuest()}
              className="text-xs sm:text-sm text-stone-500 hover:text-stone-800 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-500 transition-colors cursor-pointer py-1"
            >
              Continue offline without an account →
            </button>
          </div>

          {/* ------------------------------------------------------------------ */}
          {/*  Visual App Preview: Tactile Café Card + Stylized Map Pin           */}
          {/* ------------------------------------------------------------------ */}
          <div className="mt-12 w-full max-w-2xl bg-white rounded-2xl p-4 sm:p-5 border border-stone-200/90 shadow-sm text-left relative overflow-hidden">
            {/* Subtle top decoration badge */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-xs font-medium text-stone-600">Sample Venue Record · Offline Synced</span>
              </div>
              <span className="text-[11px] font-mono text-stone-600 bg-stone-100 px-2 py-0.5 rounded">
                KeepCheck v2.0
              </span>
            </div>

            <div className="grid sm:grid-cols-5 gap-4 items-center">
              {/* Left 3 cols: Venue Card */}
              <div className="sm:col-span-3 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center shrink-0">
                      <Coffee className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-serif font-bold text-base text-stone-900 leading-snug">
                        Yardstick Specialty Coffee
                      </h2>
                      <p className="text-xs text-stone-500 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-stone-400" />
                        Legaspi Village, Makati · 250 m away
                      </p>
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200/80 px-2 py-0.5 rounded-full text-xs font-semibold shrink-0">
                    <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                    <span>4.8</span>
                  </div>
                </div>

                {/* Vibe Tags & Must Order */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-stone-100 text-stone-700 px-2 py-0.5 rounded-md">
                    <Wifi className="w-3 h-3 text-stone-500" />
                    Fast Wi-Fi
                  </span>
                  <span className="text-[11px] font-medium bg-stone-100 text-stone-700 px-2 py-0.5 rounded-md">
                    Quiet Vibe
                  </span>
                  <span className="text-[11px] font-medium bg-stone-100 text-stone-700 px-2 py-0.5 rounded-md">
                    ₱₱
                  </span>
                  <span className="text-[11px] font-semibold bg-amber-100/80 text-amber-900 px-2 py-0.5 rounded-md border border-amber-200/60">
                    Must Order: Spanish Latte & Sea Salt Cookie
                  </span>
                </div>
              </div>

              {/* Right 2 cols: Stylized Map Pin Preview */}
              <div className="sm:col-span-2 h-28 sm:h-32 bg-[#F3EFEA] rounded-xl border border-stone-200/80 relative flex items-center justify-center overflow-hidden">
                {/* Stylized map grid lines */}
                <div className="absolute inset-0 opacity-20 bg-[linear-gradient(to_right,#a8a29e_1px,transparent_1px),linear-gradient(to_bottom,#a8a29e_1px,transparent_1px)] bg-[size:16px_16px]" />
                
                {/* Stylized route curve */}
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 160 120" fill="none">
                  <path
                    d="M 20 100 Q 70 80 80 55 T 140 25"
                    stroke="#2563eb"
                    strokeWidth="3"
                    strokeDasharray="4 3"
                    opacity="0.8"
                  />
                </svg>

                {/* Pin with pulse */}
                <div className="relative z-10 flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-amber-600 text-white flex items-center justify-center shadow-md border-2 border-white ring-4 ring-amber-500/20">
                    <Coffee className="w-4 h-4" />
                  </div>
                  <span className="mt-1 text-[10px] font-bold bg-white/95 px-1.5 py-0.5 rounded shadow-2xs text-stone-800 border border-stone-200">
                    3 min walk
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------------ */}
          {/*  3 Compact Feature Highlights Grid                                 */}
          {/* ------------------------------------------------------------------ */}
          <div className="mt-14 w-full grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
            {/* Feature 1: Venue-First Map */}
            <div className="bg-white rounded-2xl p-5 border border-stone-200/80 shadow-2xs hover:shadow-xs transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center mb-3.5">
                <Compass className="w-5 h-5 text-amber-800" />
              </div>
              <h3 className="font-serif font-bold text-base text-stone-900 mb-1.5">
                Venue-First Map
              </h3>
              <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                Search and tap real cafés and restaurants directly on the map. Find hidden gems with live OSM discovery, nearby sorting, and walking routes.
              </p>
            </div>

            {/* Feature 2: Order & Vibe Memory */}
            <div className="bg-white rounded-2xl p-5 border border-stone-200/80 shadow-2xs hover:shadow-xs transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center mb-3.5">
                <Coffee className="w-5 h-5 text-amber-800" />
              </div>
              <h3 className="font-serif font-bold text-base text-stone-900 mb-1.5">
                Order & Vibe Memory
              </h3>
              <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                Remember what to order again (and what to skip), Wi-Fi and power outlet availability, noise levels, and your past visit timeline with photos.
              </p>
            </div>

            {/* Feature 3: Offline-First & Synced */}
            <div className="bg-white rounded-2xl p-5 border border-stone-200/80 shadow-2xs hover:shadow-xs transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center mb-3.5">
                <Cloud className="w-5 h-5 text-amber-800" />
              </div>
              <h3 className="font-serif font-bold text-base text-stone-900 mb-1.5">
                Offline-First & Synced
              </h3>
              <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                Works instantly with zero cellular reception inside dense cafés. All records save locally to IndexedDB and sync to your Google account when online.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* ------------------------------------------------------------------ */}
      {/*  Footer                                                            */}
      {/* ------------------------------------------------------------------ */}
      <footer className="w-full border-t border-stone-200/80 py-6 px-4 text-center text-xs text-stone-600">
        <p>KeepCheck — Modern offline-first culinary notebook & venue explorer.</p>
      </footer>
    </div>
  );
}
