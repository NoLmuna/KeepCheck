"use client";

import Image from "next/image";
import { useAuth } from "@/lib/auth";
import JournalApp from "@/components/JournalApp";
import LandingPage from "@/components/LandingPage";

export default function Home() {
  const { user, cachedSession, isGuest, loading } = useAuth();

  // Zero-flash initial loading state
  if (loading && !cachedSession && !isGuest) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-[#F8F6F2]">
        <div className="flex flex-col items-center gap-3.5">
          <div className="relative w-12 h-12 rounded-2xl overflow-hidden border border-stone-200/90 bg-white flex items-center justify-center shadow-xs animate-pulse">
            <Image
              src="/KeepCheck-Logo.png"
              alt="KeepCheck logo"
              width={38}
              height={38}
              className="object-contain p-1"
              priority
            />
          </div>
          <div className="flex items-center gap-2 text-stone-600 text-xs font-semibold">
            <div className="w-3.5 h-3.5 border-2 border-stone-300 border-t-amber-700 rounded-full animate-spin" />
            <span className="font-serif">Loading KeepCheck…</span>
          </div>
        </div>
      </div>
    );
  }

  // If user is authenticated (or working offline with cached session or in guest mode), open workspace
  if (user || cachedSession || isGuest) {
    return <JournalApp mode="split" />;
  }

  // Otherwise, render the crisp editorial landing page
  return <LandingPage />;
}
