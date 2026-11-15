"use client";

import Image from "next/image";
import { useAuth } from "@/lib/auth";
import JournalApp from "@/components/JournalApp";
import LandingPage from "@/components/LandingPage";

export default function MapPage() {
  const { user, cachedSession, isGuest, loading } = useAuth();

  if (loading && !cachedSession && !isGuest) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-[#F8F6F2]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-5 h-5 border-2 border-stone-300 border-t-amber-700 rounded-full animate-spin" />
          <span className="text-xs text-stone-500 font-medium">Opening discovery map…</span>
        </div>
      </div>
    );
  }

  if (user || cachedSession || isGuest) {
    return <JournalApp mode="map" />;
  }

  return <LandingPage />;
}
