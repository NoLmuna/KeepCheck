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
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  type User,
} from "firebase/auth";
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
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [quickLoginAccounts, setQuickLoginAccounts] = useState<
    QuickLoginAccount[]
  >([]);
  const [cachedSession, setCachedSession] = useState<CachedSession | null>(null);

  /*
   * Loading-state strategy for signInWithRedirect:
   *
   * After a redirect round-trip (Google OAuth → back to app), the page fully
   * remounts. Two async checks race on startup:
   *   1. onAuthStateChanged — fires once Firebase restores (or doesn't find)
   *      a persisted credential from IndexedDB.
   *   2. getRedirectResult — resolves the pending redirect credential, if any.
   *
   * If we set `loading = false` as soon as *either* resolves, there's a window
   * where AuthGuard sees `loading=false, user=null` and flashes the sign-in
   * screen before the other check delivers the user. To prevent this, we gate
   * `loading` behind BOTH checks completing.
   */
  const authStateResolved = useRef(false);
  const redirectResultResolved = useRef(false);
  const [loading, setLoading] = useState(true);

  /** Only flip `loading` to false once both async checks have finished. */
  const maybeFinishLoading = useCallback(() => {
    if (authStateResolved.current && redirectResultResolved.current) {
      setLoading(false);
    }
  }, []);

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

  // Resolve any pending redirect result (runs once on mount).
  // After signInWithRedirect, the page reloads and this picks up the credential.
  // On normal loads with no pending redirect, this resolves to null instantly.
  const redirectHandled = useRef(false);
  useEffect(() => {
    if (redirectHandled.current) return;
    redirectHandled.current = true;

    getRedirectResult(getFirebaseAuth())
      .then((result) => {
        if (result?.user) {
          console.log("[KeepCheck] Redirect sign-in resolved:", result.user.email);
          saveToQuickLogin(result.user);
        }
      })
      .catch((err) => {
        // Non-fatal — this fires on every mount, including normal loads.
        console.warn("[KeepCheck] getRedirectResult error (non-fatal):", err);
      })
      .finally(() => {
        redirectResultResolved.current = true;
        maybeFinishLoading();
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen to Firebase auth state.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (firebaseUser) => {
      setUser(firebaseUser);
      authStateResolved.current = true;
      maybeFinishLoading();

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
  }, [saveToQuickLogin, maybeFinishLoading]);

  // Sign in with Google — uses redirect flow for iOS PWA (standalone WKWebView)
  // compatibility. signInWithRedirect navigates away to Google's OAuth page;
  // the getRedirectResult useEffect above catches the credential on reload.
  const signInWithGoogle = useCallback(async (email?: string) => {
    const provider = new GoogleAuthProvider();
    if (email) {
      provider.setCustomParameters({ login_hint: email });
    } else {
      provider.setCustomParameters({ prompt: "select_account" });
    }

    const auth = getFirebaseAuth();
    // Page will navigate away to Google OAuth — no result to handle here.
    await signInWithRedirect(auth, provider);
  }, []);

  // Sign out.
  const signOut = useCallback(async () => {
    console.log("[KeepCheck AuthContext] signOut called");
    // Clear cached session immediately
    clearCachedSession();
    setCachedSession(null);
    // Trigger Firebase sign-out in the background.
    firebaseSignOut(getFirebaseAuth())
      .then(() => {
        console.log("[KeepCheck AuthContext] Firebase signOut completed successfully");
      })
      .catch((error) => {
        console.error("[KeepCheck AuthContext] Background Firebase signOut error:", error);
      });
    // Immediately clear local state for instant redirect.
    console.log("[KeepCheck AuthContext] Setting user to null");
    setUser(null);
  }, []);

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
