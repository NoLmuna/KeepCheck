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
  getRedirectResult,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "./firebase";
import { useToast } from "./toast";
import { associateLocalRecordsWithUser } from "./journalSync";

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
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function AuthProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [quickLoginAccounts, setQuickLoginAccounts] = useState<QuickLoginAccount[]>([]);
  const [cachedSession, setCachedSession] = useState<CachedSession | null>(null);

  // Guard to prevent repeating welcome toast
  const prevUserRef = useRef<User | null>(null);

  // Load cached session + guest mode + quick-login history from localStorage on mount.
  useEffect(() => {
    try {
      const storedGuest = localStorage.getItem(GUEST_MODE_KEY);
      if (storedGuest === "true") setIsGuest(true);
    } catch {}

    const cached = loadCachedSession();
    if (cached) {
      setCachedSession(cached);
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
    if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY || !process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
      setLoading(false);
      return;
    }

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
          showToast(`👋 Welcome back, ${name}!`, "success");
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

        // Automatically associate guest/local records with user.uid
        try {
          await associateLocalRecordsWithUser(firebaseUser.uid);
        } catch (e) {
          console.error("[KeepCheck Auth] Failed to associate local records:", e);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [saveToQuickLogin, showToast]);

  // Sign in with Google using Firebase Authentication (popup with redirect fallback)
  const signInWithGoogle = useCallback(async (emailHint?: string): Promise<User | void> => {
    const auth = getFirebaseAuth();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: "select_account",
      ...(emailHint ? { login_hint: emailHint } : {}),
    });

    try {
      const result = await signInWithPopup(auth, provider);
      setIsGuest(false);
      try {
        localStorage.removeItem(GUEST_MODE_KEY);
      } catch {}
      return result.user;
    } catch (err: unknown) {
      const authErr = err as { code?: string; message?: string };
      // Automatic fallback to redirect if popup is blocked or unsupported in standalone PWA
      if (
        authErr.code === "auth/popup-blocked" ||
        authErr.code === "auth/operation-not-supported-in-this-environment"
      ) {
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

  // Sign out cleanly
  const signOut = useCallback(async () => {
    showToast("👋 Signed out successfully", "info");
    try {
      const auth = getFirebaseAuth();
      await firebaseSignOut(auth);
    } catch (error) {
      console.error("[KeepCheck Auth] Firebase signOut error:", error);
    }

    clearCachedSession();
    setCachedSession(null);
    setUser(null);
    setIsGuest(false);
    try {
      localStorage.removeItem(GUEST_MODE_KEY);
    } catch {}
  }, [showToast]);

  const continueAsGuest = useCallback(() => {
    setIsGuest(true);
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

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
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
