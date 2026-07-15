"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, type QuickLoginAccount } from "@/lib/auth";

/* ------------------------------------------------------------------ */
/*  Google icon SVG                                                    */
/* ------------------------------------------------------------------ */
function GoogleIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Quick-login account row                                            */
/* ------------------------------------------------------------------ */
function QuickLoginRow({
  account,
  onClick,
}: {
  account: QuickLoginAccount;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="neu-raised group flex w-full items-center gap-3 rounded-2xl p-3 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] active:shadow-neu-inset cursor-pointer"
    >
      {account.photoURL ? (
        <img
          src={account.photoURL}
          alt=""
          className="h-10 w-10 rounded-full object-cover ring-2 ring-accent/30"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/20 text-accent font-bold text-sm">
          {(account.displayName?.[0] ?? account.email?.[0] ?? "?").toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-semibold text-text-primary">
          {account.displayName ?? "User"}
        </p>
        <p className="truncate text-xs text-text-secondary">
          {account.email ?? "No email"}
        </p>
      </div>
      <svg
        className="h-4 w-4 text-text-secondary/50 transition-transform group-hover:translate-x-0.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Login page                                                         */
/* ------------------------------------------------------------------ */
export default function LoginPage() {
  const { user, loading, signInWithGoogle, quickLoginAccounts, standalonePWASignInBlocked } = useAuth();
  const router = useRouter();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The app's web URL, used in the standalone PWA guidance message. */
  const [appUrl, setAppUrl] = useState(process.env.NEXT_PUBLIC_APP_URL ?? "");
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_APP_URL) {
      setAppUrl(window.location.origin);
    }
  }, []);

  // Redirect if already logged in.
  useEffect(() => {
    if (!loading && user) {
      router.replace("/");
    }
  }, [user, loading, router]);

  async function handleSignIn(email?: string) {
    setSigningIn(true);
    setError(null);
    try {
      await signInWithGoogle(email);
    } catch {
      setError("Sign-in failed. Please try again.");
    } finally {
      setSigningIn(false);
    }
  }

  // Don't render until auth state resolves (prevents flash).
  if (loading || user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-text-secondary/20 border-t-accent" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-bg px-5 py-10">
      {/* ---- SVG Gooey filter (reused by blobs) ---- */}
      <svg className="absolute h-0 w-0" aria-hidden="true">
        <defs>
          <filter id="gooey-login">
            <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8"
              result="gooey"
            />
            <feComposite in="SourceGraphic" in2="gooey" operator="atop" />
          </filter>
        </defs>
      </svg>

      {/* ---- Animated background blobs ---- */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ filter: "url(#gooey-login)" }}>
        <div className="animate-blob-1 absolute -top-24 -left-24 h-72 w-72 rounded-full bg-accent/15" />
        <div className="animate-blob-2 absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-category-cafe/15" />
        <div className="animate-blob-3 absolute top-1/3 right-1/4 h-48 w-48 rounded-full bg-category-restaurant/15" />
      </div>

      {/* ---- Main card ---- */}
      <div className="relative z-10 w-full max-w-sm animate-page-enter">
        {/* Logo + title */}
        <div className="mb-8 text-center">
          <div className="neu-raised mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl">
            <img
              src="/KeepCheck-Logo.png"
              alt="KeepCheck"
              className="h-14 w-14 object-contain"
            />
          </div>
          <h1 className="text-3xl font-serif font-bold tracking-tight text-text-primary">
            Keep<span className="text-accent">Check</span>
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Track &amp; rate every café and restaurant.
          </p>
        </div>

        {/* Sign-in area */}
        {standalonePWASignInBlocked ? (
          /* ---- Standalone PWA dead-end guidance ---- */
          <div className="neu-raised rounded-2xl p-5 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15">
              <svg className="h-6 w-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-text-primary mb-2">
              Sign in via Safari first
            </h2>
            <p className="text-xs text-text-secondary leading-relaxed mb-4">
              Sign-in isn&apos;t available directly from the installed app yet.
              Open the link below in <strong>Safari</strong>, sign in there once, then
              reopen KeepCheck from your home screen &mdash; you&apos;ll be logged in automatically.
            </p>
            <a
              href={appUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent/10 px-4 py-2.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/20"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Open in Safari
            </a>
            <p className="mt-3 text-[10px] text-text-secondary/50">
              {appUrl}
            </p>
          </div>
        ) : (
          /* ---- Normal sign-in flow ---- */
          <>
            {/* Google sign-in button */}
            <button
              type="button"
              onClick={() => handleSignIn()}
              disabled={signingIn}
              className="neu-raised group flex w-full items-center justify-center gap-3 rounded-2xl px-6 py-4 text-sm font-semibold text-text-primary transition-all duration-300 hover:scale-[1.02] active:scale-[0.97] active:shadow-neu-inset disabled:opacity-50 cursor-pointer"
            >
              {signingIn ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-text-secondary/30 border-t-accent" />
              ) : (
                <GoogleIcon />
              )}
              {signingIn ? "Signing in\u2026" : "Continue with Google"}
            </button>

            {/* Error message */}
            {error && (
              <p className="mt-3 text-center text-xs text-red-500 animate-page-enter">
                {error}
              </p>
            )}

            {/* Quick login history */}
            {quickLoginAccounts.length > 0 && (
              <div className="mt-8 animate-page-enter" style={{ animationDelay: "150ms" }}>
                <p className="mb-3 text-center text-xs font-medium uppercase tracking-wider text-text-secondary">
                  Recent accounts
                </p>
                <div className="flex flex-col gap-2.5">
                   {quickLoginAccounts.map((account) => (
                    <QuickLoginRow
                      key={account.uid}
                      account={account}
                      onClick={() => handleSignIn(account.email || undefined)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <p className="mt-10 text-center text-[11px] text-text-secondary/60">
          Your data is stored securely and syncs across devices.
        </p>
      </div>
    </div>
  );
}
