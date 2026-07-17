import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  initializeAuth,
  browserPopupRedirectResolver,
  type Auth,
} from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Ensure only one Firebase app is ever initialised (SSR + hot-reload safe).
function getApp_(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

// ---------------------------------------------------------------------------
// Lazy singletons — initialised on first access so they never run during SSR.
// ---------------------------------------------------------------------------

let _auth: Auth | null = null;
let _firestore: Firestore | null = null;

/**
 * Returns the Firebase Auth singleton.
 *
 * Uses IndexedDB persistence (survives offline / PWA restarts).
 * Falls back to browser localStorage if IndexedDB is unavailable.
 */
export function getFirebaseAuth(): Auth {
  if (_auth) return _auth;

  const app = getApp_();

  try {
    _auth = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    // Already initialised (hot-reload) — use existing instance.
    _auth = getAuth(app);
  }

  return _auth;
}

/**
 * Returns the Firestore singleton with multi-tab offline persistence.
 */
export function getFirebaseFirestore(): Firestore {
  if (_firestore) return _firestore;

  const app = getApp_();

  try {
    _firestore = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
      ignoreUndefinedProperties: true,
    });
  } catch {
    // Already initialised (hot-reload).
    _firestore = getFirestore(app);
  }

  return _firestore;
}


