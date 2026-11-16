"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithCustomToken,
  getRedirectResult,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import {
  signIn as nextAuthSignIn,
  signOut as nextAuthSignOut,
  useSession,
  SessionProvider,
} from "next-auth/react";
import { getFirebaseAuth } from "./firebase";
import { useToast } from "./toast";
import { associateLocalRecordsWithUser } from "./journalSync";
import type { AuthActionState } from "@/components/AuthTransitionOverlay";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface QuickLoginAccount {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  lastLoginAt: number;
}

/** Lightweight cached session stored in localStorage for instant offline access. */
export interface CachedSession {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  authResolved: boolean;
  authAction: AuthActionState;
  setAuthAction: (action: AuthActionState) => void;
  isGuest: boolean;
  continueAsGuest: () => void;
  exitGuestMode: () => void;
  signInWithGoogle: (email?: string) => Promise<User | void>;
  signOut: () => Promise<void>;
  quickLoginAccounts: QuickLoginAccount[];
  /** Cached session from localStorage — available instantly, even offline. */
  cachedSession: CachedSession | null;
}

const QUICK_LOGIN_KEY = "keepcheck-quick-login";
const SESSION_CACHE_KEY = "keepcheck-session";
const GUEST_MODE_KEY = "keepcheck-guest-mode";
const MAX_QUICK_LOGIN = 5;

/* ------------------------------------------------------------------ */
/*  Session cache helpers                                              */
/* ------------------------------------------------------------------ */

function loadCachedSession(): CachedSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.uid === "string") return parsed as CachedSession;
    return null;
  } catch {
    return null;
  }
}

function saveCachedSession(user: User): void {
  if (typeof window === "undefined") return;
  try {
    const session: CachedSession = {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
    };
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(session));
  } catch {
    /* storage full — best effort */
  }
}

function clearCachedSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SESSION_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

const AuthContext = createContext<AuthContextValue | null>(null);

/* ------------------------------------------------------------------ */
/*  Provider (outer shell wrapping SessionProvider)                    */
/* ------------------------------------------------------------------ */

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AuthProviderInner>{children}</AuthProviderInner>
    </SessionProvider>
  );
}

/* ------------------------------------------------------------------ */
/*  Provider (inner with access to NextAuth + Firebase)                */
/* ------------------------------------------------------------------ */

function AuthProviderInner({ children }: { children: ReactNode }) {
  const { data: nextAuthSession, status: nextAuthStatus } = useSession();
  const { showToast } = useToast();

  const [user, setUser] = useState<User | null>(null);
  const [firebaseLoading, setFirebaseLoading] = useState(true);
  const [authResolved, setAuthResolved] = useState(false);
  const [authAction, setAuthAction] = useState<AuthActionState>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [quickLoginAccounts, setQuickLoginAccounts] = useState<QuickLoginAccount[]>([]);
  const [cachedSession, setCachedSession] = useState<CachedSession | null>(null);

  // Guard to prevent repeating welcome toast
  const prevUserRef = useRef<User | null>(null);
  const tokenBridgeInFlight = useRef(false);

  // Load cached session + guest mode + quick-login history from localStorage on mount.
  useEffect(() => {
    try {
      const storedGuest = localStorage.getItem(GUEST_MODE_KEY);
      if (storedGuest === "true") {
        setIsGuest(true);
        setAuthResolved(true);
      }
    } catch {}

    const cached = loadCachedSession();
    if (cached) {
      setCachedSession(cached);
      setAuthResolved(true);
    }

    try {
      const stored = localStorage.getItem(QUICK_LOGIN_KEY);
      if (stored) setQuickLoginAccounts(JSON.parse(stored));
    } catch {}
  }, []);

  const saveToQuickLogin = useCallback((u: User) => {
    setQuickLoginAccounts((prev: QuickLoginAccount[]) => {
      const filtered = prev.filter((a: QuickLoginAccount) => a.uid !== u.uid);
      const entry: QuickLoginAccount = {
        uid: u.uid,
        displayName: u.displayName,
        email: u.email,
        photoURL: u.photoURL,
        lastLoginAt: Date.now(),
      };
      const updated = [entry, ...filtered].slice(0, MAX_QUICK_LOGIN);

      try {
        localStorage.setItem(QUICK_LOGIN_KEY, JSON.stringify(updated));
      } catch {}

      return updated;
    });
  }, []);

  // Listen to Firebase auth state & handle redirect result
  useEffect(() => {
    let isMounted = true;
    const auth = getFirebaseAuth();

    // Check for pending redirect sign-in result (mobile / PWA fallback)
    getRedirectResult(auth)
      .then((result) => {
        if (!isMounted) return;
        if (result?.user) {
          setIsGuest(false);
          try {
            localStorage.removeItem(GUEST_MODE_KEY);
          } catch {}
        }
      })
      .catch((err: unknown) => {
        const authErr = err as { code?: string; message?: string };
        if (authErr?.code && authErr.code !== "auth/popup-closed-by-user") {
          console.warn("[KeepCheck Auth] Redirect result error:", err);
        }
      });

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!isMounted) return;

      if (firebaseUser) {
        if (!prevUserRef.current) {
          const name = firebaseUser.displayName ?? firebaseUser.email ?? "friend";
          setTimeout(() => {
            showToast(`Welcome back, ${name}!`, "success");
          }, 250);
        }
        prevUserRef.current = firebaseUser;

        setUser(firebaseUser);
        setIsGuest(false);
        try {
          localStorage.removeItem(GUEST_MODE_KEY);
        } catch {}

        saveToQuickLogin(firebaseUser);
        saveCachedSession(firebaseUser);
        setCachedSession({
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName,
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL,
        });

        // Dismiss auth action now that session is active
        setAuthAction(null);

        // Automatically associate guest/local records with user.uid
        try {
          const claimedCount = await associateLocalRecordsWithUser(firebaseUser.uid);
          if (claimedCount > 0) {
            showToast("Your saved spots are now synced to your Google account", "success");
          }
        } catch (e) {
          console.error("[KeepCheck Auth] Failed to associate local records:", e);
        }
      } else {
        setUser(null);
        setAuthAction(null);
      }
      setFirebaseLoading(false);
      setAuthResolved(true);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [saveToQuickLogin, showToast]);

  // ---- NextAuth (Vercel OAuth) → Firebase Token Bridge ----
  // When NextAuth session resolves (e.g. on Vercel deployment using AUTH_GOOGLE_ID/AUTH_SECRET),
  // exchange it via /api/firebase-token for a Firebase custom token.
  useEffect(() => {
    if (
      nextAuthStatus !== "authenticated" ||
      !nextAuthSession?.user?.email ||
      user !== null ||
      tokenBridgeInFlight.current
    ) {
      return;
    }

    tokenBridgeInFlight.current = true;
    setAuthAction("signing-in");

    (async () => {
      try {
        const res = await fetch("/api/firebase-token", { method: "POST" });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Token bridge failed (${res.status}): ${body}`);
        }

        const { customToken } = await res.json();
        await signInWithCustomToken(getFirebaseAuth(), customToken);
        setIsGuest(false);
        try {
          localStorage.removeItem(GUEST_MODE_KEY);
        } catch {}
      } catch (err) {
        console.warn("[KeepCheck] Firebase token bridge error (falling back to client auth):", err);
        tokenBridgeInFlight.current = false;
        setAuthAction(null);
      }
    })();
  }, [nextAuthStatus, nextAuthSession, user]);

  // Unified Google Sign In:
  // 1. Tries NextAuth signIn (standard for Vercel with AUTH_GOOGLE_ID & AUTH_SECRET).
  // 2. Falls back cleanly to Firebase client signInWithPopup / signInWithRedirect.
  const signInWithGoogle = useCallback(async (emailHint?: string): Promise<User | void> => {
    tokenBridgeInFlight.current = false;
    setIsGuest(false);
    setAuthAction("signing-in");
    try {
      localStorage.removeItem(GUEST_MODE_KEY);
    } catch {}

    // First attempt NextAuth OAuth (used on Vercel)
    try {
      await nextAuthSignIn("google", undefined, emailHint ? { login_hint: emailHint } : undefined);
      return;
    } catch (nextAuthErr) {
      console.warn("[KeepCheck Auth] NextAuth sign-in attempt finished or failed, trying Firebase client auth:", nextAuthErr);
    }

    // Direct Firebase client fallback
    try {
      const auth = getFirebaseAuth();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: "select_account",
        ...(emailHint ? { login_hint: emailHint } : {}),
      });

      const result = await signInWithPopup(auth, provider);
      return result.user;
    } catch (err: unknown) {
      setAuthAction(null);
      const authErr = err as { code?: string; message?: string };
      if (
        authErr.code === "auth/popup-blocked" ||
        authErr.code === "auth/operation-not-supported-in-this-environment"
      ) {
        setAuthAction("signing-in");
        const auth = getFirebaseAuth();
        const provider = new GoogleAuthProvider();
        await signInWithRedirect(auth, provider);
        return;
      }
      if (authErr.code === "auth/popup-closed-by-user") {
        throw new Error("Sign-in cancelled.");
      }
      if (authErr.code === "auth/cancelled-popup-request") {
        return;
      }
      throw new Error(authErr.message || "Sign-in failed. Please try again.");
    }
  }, []);

  // Instant, clean sign out of both NextAuth and Firebase
  const signOut = useCallback(async () => {
    // Synchronously clear user session state so the UI instantly transitions to LandingPage
    clearCachedSession();
    setCachedSession(null);
    setUser(null);
    setIsGuest(false);
    prevUserRef.current = null;
    tokenBridgeInFlight.current = false;
    setAuthAction(null);
    // authResolved remains true to prevent any flash or loading screen!

    try {
      localStorage.removeItem(GUEST_MODE_KEY);
    } catch {}

    try {
      await nextAuthSignOut({ redirect: false });
    } catch (error) {
      console.error("[KeepCheck Auth] NextAuth signOut error:", error);
    }

    try {
      const auth = getFirebaseAuth();
      await firebaseSignOut(auth);
    } catch (error) {
      console.error("[KeepCheck Auth] Firebase signOut error:", error);
    }

    showToast("Signed out successfully", "info");
  }, [showToast]);

  const continueAsGuest = useCallback(() => {
    setIsGuest(true);
    setAuthResolved(true);
    try {
      localStorage.setItem(GUEST_MODE_KEY, "true");
    } catch {}
  }, []);

  const exitGuestMode = useCallback(() => {
    setIsGuest(false);
    try {
      localStorage.removeItem(GUEST_MODE_KEY);
    } catch {}
  }, []);

  const loading = !authResolved;

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authResolved,
        authAction,
        setAuthAction,
        isGuest,
        continueAsGuest,
        exitGuestMode,
        signInWithGoogle,
        signOut,
        quickLoginAccounts,
        cachedSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
