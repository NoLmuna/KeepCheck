"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

/**
 * Client-side auth guard.
 *
 * Renders children only when the user is authenticated.
 * Redirects to /login otherwise.
 * Shows a neumorphic loading skeleton during the auth check.
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    console.log("[KeepCheck AuthGuard] State check - Loading:", loading, "User:", user ? user.email : "null");
    if (!loading && !user) {
      console.log("[KeepCheck AuthGuard] Redirecting to /login via window.location");
      window.location.href = "/login";
    }
  }, [user, loading]);

  if (loading) {
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

  if (!user) {
    // Will redirect — render nothing to avoid flash.
    return null;
  }

  return <>{children}</>;
}
