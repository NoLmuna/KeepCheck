"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type FoodSpotLog } from "../db";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ChevronLeft } from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import { useAuth } from "@/lib/auth";

// Dynamically import the map component with SSR disabled
const SpotsMap = dynamic(() => import("@/components/SpotsMap"), {
  ssr: false,
  loading: () => (
    <div className="py-20 text-center text-sm font-mono text-text-secondary animate-pulse neu-raised rounded-2xl bg-bg/40 border border-text-secondary/15 h-[450px] flex items-center justify-center">
      Loading Map Engine…
    </div>
  ),
});

export default function MapPage() {
  const { user } = useAuth();
  
  // Query spots from Dexie. We only fetch if the user is authenticated.
  const spots = useLiveQuery<FoodSpotLog[]>(
    () => {
      if (!user) return [];
      return db.spots.where("userId").equals(user.uid).toArray();
    },
    [user]
  );

  // Filter spots that have both coordinates
  const geotaggedSpots = spots
    ? spots.filter((spot) => spot.latitude !== undefined && spot.longitude !== undefined)
    : [];

  return (
    <AuthGuard>
      {/* ---- Background blobs (GPU-contained) ---- */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden opacity-40 blob-container" style={{ filter: "url(#gooey-bg)" }}>
        <div className="animate-blob-1 absolute -top-32 -left-32 h-80 w-80 rounded-full bg-accent/10" />
        <div className="animate-blob-2 absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-category-cafe/10" />
        <div className="animate-blob-3 absolute top-1/2 left-1/3 h-56 w-56 rounded-full bg-category-restaurant/10" />
      </div>

      {/* SVG Gooey filters for background */}
      <svg className="absolute h-0 w-0" aria-hidden="true">
        <defs>
          <filter id="gooey-bg">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="gooey" />
            <feComposite in="SourceGraphic" in2="gooey" operator="atop" />
          </filter>
        </defs>
      </svg>

      <div className="relative mx-auto flex min-h-dvh w-full max-w-screen-lg flex-col px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        {/* ---- Header ---- */}
        <header className="relative z-40 mb-6 sm:mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              aria-label="Back to home"
              className="neu-button flex h-11 w-11 items-center justify-center rounded-full text-text-secondary cursor-pointer"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-text-primary">
                Keep<span className="text-accent">Check</span> <span className="text-text-secondary font-sans font-normal text-lg sm:text-xl ml-1 sm:ml-2">/ Map</span>
              </h1>
            </div>
          </div>
        </header>

        {/* ---- Main Map Content ---- */}
        <main className="flex-1 flex flex-col justify-center">
          {spots === undefined ? (
            <div className="py-20 text-center text-sm font-mono text-text-secondary animate-pulse neu-raised rounded-2xl bg-bg/40 border border-text-secondary/15 h-[450px] flex items-center justify-center">
              Loading spots data…
            </div>
          ) : geotaggedSpots.length === 0 ? (
            <div className="py-16 text-center neu-raised bg-bg/40 border border-dashed border-text-secondary/25 rounded-3xl max-w-md mx-auto px-6 w-full">
              <div className="neu-raised bg-bg inline-flex h-20 w-20 items-center justify-center rounded-3xl mx-auto mb-4">
                <span className="text-3xl">📍</span>
              </div>
              <h2 className="text-base font-semibold text-text-primary mb-2">No locations found</h2>
              <p className="text-sm text-text-secondary font-medium leading-relaxed">
                None of your logged spots have location coordinates. Submit a new spot and allow location access to see them on the map!
              </p>
            </div>
          ) : (
            <div className="flex-1 h-full w-full relative">
              <SpotsMap spots={geotaggedSpots} />
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
