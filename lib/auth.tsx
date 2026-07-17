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
  onAuthStateChanged,
  signInWithCustomToken,
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
  signInWithGoogle: (email?: string) => Promise<void>;
  signOut: () => Promise<void>;
  quickLoginAccounts: QuickLoginAccount[];
  /** Cached session from localStorage — available instantly, even offline. */
  cachedSession: CachedSession | null;
}

const QUICK_LOGIN_KEY = "keepcheck-quick-login";
const SESSION_CACHE_KEY = "keepcheck-session";
const MAX_QUICK_LOGIN = 5;

/* ------------------------------------------------------------------ */
/*  Session cache helpers                                              */
/* ------------------------------------------------------------------ */

function loadCachedSession(): CachedSession | null {
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
/*  Provider (outer shell)                                             */
/*                                                                     */
/*  SessionProvider must wrap AuthProviderInner so that useSession()   */
/*  inside AuthProviderInner is a valid descendant of the provider.    */
/*  A component cannot render SessionProvider and also call            */
/*  useSession() in the same function body — React context requires    */
/*  the consumer to be a child in the tree.                            */
/* ------------------------------------------------------------------ */

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AuthProviderInner>{children}</AuthProviderInner>
    </SessionProvider>
  );
}

/* ------------------------------------------------------------------ */
/*  Provider (inner — has access to useSession)                        */
/* ------------------------------------------------------------------ */

function AuthProviderInner({ children }: { children: ReactNode }) {
  const { data: nextAuthSession, status: nextAuthStatus } = useSession();

  const [user, setUser] = useState<User | null>(null);
  const [firebaseLoading, setFirebaseLoading] = useState(true);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [quickLoginAccounts, setQuickLoginAccounts] = useState<
    QuickLoginAccount[]
  >([]);
  const [cachedSession, setCachedSession] = useState<CachedSession | null>(null);

  // ---- Ref guard: prevent duplicate token-bridge calls ----
  // Similar to the old redirectHandled ref — ensures the POST to
  // /api/firebase-token fires at most once per session lifecycle,
  // even if the effect re-runs before Firebase auth state has updated.
  const tokenBridgeInFlight = useRef(false);

  // Load cached session + quick-login history from localStorage on mount.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(QUICK_LOGIN_KEY);
      if (stored) setQuickLoginAccounts(JSON.parse(stored));
    } catch {
      // Ignore parse errors.
    }

    // Load cached session for instant offline rendering
    const cached = loadCachedSession();
    if (cached) {
      setCachedSession(cached);
    }
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
      } catch {
        // Storage full — silently skip.
      }

      return updated;
    });
  }, []);

  // Listen to Firebase auth state.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (firebaseUser) => {
      setUser(firebaseUser);
      setFirebaseLoading(false);

      if (firebaseUser) {
        saveToQuickLogin(firebaseUser);
        // Persist session for offline access
        saveCachedSession(firebaseUser);
        setCachedSession({
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName,
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL,
        });
      }
    });
    return unsubscribe;
  }, [saveToQuickLogin]);

  // ---- NextAuth → Firebase token bridge ----
  //
  // When NextAuth has an active session (user authenticated via Google OAuth)
  // but Firebase doesn't have a user yet, exchange the NextAuth session for a
  // Firebase custom token. The ref guard prevents duplicate requests.
  useEffect(() => {
    // Only proceed when:
    //  - NextAuth has resolved (not "loading")
    //  - NextAuth has a session with an email
    //  - Firebase doesn't have a user yet
    //  - We haven't already started a bridge request
    if (
      nextAuthStatus !== "authenticated" ||
      !nextAuthSession?.user?.email ||
      user !== null ||
      tokenBridgeInFlight.current
    ) {
      return;
    }

    tokenBridgeInFlight.current = true;
    setBridgeError(null);

    (async () => {
      try {
        const res = await fetch("/api/firebase-token", { method: "POST" });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Token bridge failed (${res.status}): ${body}`);
        }

        const { customToken } = await res.json();
        await signInWithCustomToken(getFirebaseAuth(), customToken);
        // onAuthStateChanged will pick up the new Firebase user and
        // trigger saveToQuickLogin + saveCachedSession automatically.
      } catch (err) {
        console.error("[KeepCheck] Firebase token bridge error:", err);
        // Reset the guard so the user can retry (e.g. by refreshing).
        tokenBridgeInFlight.current = false;
        setBridgeError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [nextAuthStatus, nextAuthSession, user]);

  // Sign in with Google via NextAuth's OAuth flow.
  // NextAuth handles the full OAuth redirect → callback → session lifecycle.
  const signInWithGoogle = useCallback(async (email?: string) => {
    // Reset the bridge guard so a fresh sign-in triggers the bridge.
    tokenBridgeInFlight.current = false;
    setBridgeError(null);
    await nextAuthSignIn("google", undefined, email ? { login_hint: email } : undefined);
  }, []);

  // Sign out of BOTH NextAuth and Firebase.
  // Uses { redirect: false } for NextAuth so we preserve the existing behavior
  // of clearing local state instantly without a full page reload/navigation.
  const signOut = useCallback(async () => {
    console.log("[KeepCheck AuthContext] signOut called");

    try {
      // 1. Sign out of NextAuth without redirecting — explicitly set { redirect: false }
      // so it does NOT perform a full page reload redirect, avoiding races against Firebase's signOut.
      await nextAuthSignOut({ redirect: false });
      console.log("[KeepCheck AuthContext] NextAuth signOut completed successfully");
    } catch (error) {
      console.error("[KeepCheck AuthContext] NextAuth signOut error:", error);
    }

    try {
      // 2. Sign out of Firebase
      await firebaseSignOut(getFirebaseAuth());
      console.log("[KeepCheck AuthContext] Firebase signOut completed successfully");
    } catch (error) {
      console.error("[KeepCheck AuthContext] Firebase signOut error:", error);
    }

    // 3. Clear cached session and local states only AFTER both operations complete
    clearCachedSession();
    setCachedSession(null);

    // Reset bridge guard for next sign-in
    tokenBridgeInFlight.current = false;
    setBridgeError(null);

    // Set user to null to trigger AuthGuard redirect
    console.log("[KeepCheck AuthContext] Setting user to null");
    setUser(null);
  }, []);

  const loading =
    firebaseLoading ||
    nextAuthStatus === "loading" ||
    (nextAuthStatus === "authenticated" && !user && !bridgeError);

  return (
    <AuthContext.Provider
      value={{ user, loading, signInWithGoogle, signOut, quickLoginAccounts, cachedSession }}
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
