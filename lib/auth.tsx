"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  browserPopupRedirectResolver,
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
  const [loading, setLoading] = useState(true);
  const [quickLoginAccounts, setQuickLoginAccounts] = useState<
    QuickLoginAccount[]
  >([]);
  const [cachedSession, setCachedSession] = useState<CachedSession | null>(null);

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
      setLoading(false);

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

  // Sign in with Google — always uses popup (iOS 16.4+ supports popups in PWAs).
  const signInWithGoogle = useCallback(async (email?: string) => {
    const provider = new GoogleAuthProvider();
    if (email) {
      provider.setCustomParameters({ login_hint: email });
    } else {
      provider.setCustomParameters({ prompt: "select_account" });
    }

    const auth = getFirebaseAuth();

    try {
      const result = await signInWithPopup(auth, provider, browserPopupRedirectResolver);
      saveToQuickLogin(result.user);
    } catch (error: unknown) {
      // User closed popup — not an error.
      const code = (error as { code?: string })?.code;
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        console.error("[KeepCheck] Google sign-in failed:", error);
        throw error;
      }
    }
  }, [saveToQuickLogin]);

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
