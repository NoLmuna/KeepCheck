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

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  quickLoginAccounts: QuickLoginAccount[];
}

const QUICK_LOGIN_KEY = "keepcheck-quick-login";
const MAX_QUICK_LOGIN = 5;

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

  // Load quick-login history from localStorage on mount.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(QUICK_LOGIN_KEY);
      if (stored) setQuickLoginAccounts(JSON.parse(stored));
    } catch {
      // Ignore parse errors.
    }
  }, []);

  // Persist a user to quick-login history.
  const saveToQuickLogin = useCallback((u: User) => {
    setQuickLoginAccounts((prev) => {
      const filtered = prev.filter((a) => a.uid !== u.uid);
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
      }
    });
    return unsubscribe;
  }, [saveToQuickLogin]);

  // Sign in with Google popup.
  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      const result = await signInWithPopup(getFirebaseAuth(), provider, browserPopupRedirectResolver);
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
      value={{ user, loading, signInWithGoogle, signOut, quickLoginAccounts }}
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
