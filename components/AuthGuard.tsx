"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

/**
 * Client-side auth guard.
 *
 * Renders children only when the user is authenticated.
 * Redirects to /login otherwise.
 *
 * Offline behaviour:
 * - While Firebase Auth is still loading, checks `cachedSession` from
 *   localStorage. If a cached session exists, renders children immediately
 *   using the cached UID (Dexie queries work offline with this UID).
 * - Only redirects to /login when Firebase confirms no user AND there
 *   is no cached session — prevents offline redirect loops.
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, cachedSession } = useAuth();

  useEffect(() => {
    // Only redirect when auth has fully resolved AND there's no cached session
    if (!loading && !user && !cachedSession) {
      console.log("[KeepCheck AuthGuard] No user or cached session — redirecting to /login");
      window.location.href = "/login";
    }
  }, [user, loading, cachedSession]);

  // Show loading spinner only when there's no cached session to fall back on
  if (loading && !cachedSession) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <div className="neu-raised flex flex-col items-center gap-4 rounded-3xl p-10">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-text-secondary/20 border-t-accent" />
          <p className="text-sm font-medium text-text-secondary animate-pulse">
            Loading…
          </p>
        </div>
      </div>
    );
  }

  // No user AND no cached session → will redirect, render nothing to avoid flash
  if (!user && !cachedSession) {
    return null;
  }

  // Either the real user is present, or we have a cached session to work with offline
  return <>{children}</>;
}
