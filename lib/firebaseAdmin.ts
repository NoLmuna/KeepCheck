/**
 * Firebase Admin SDK — server-only initialisation.
 *
 * ⚠️  SECURITY:
 *   • FIREBASE_SERVICE_ACCOUNT_JSON must be set as a server-only env var
 *     in Vercel (NOT prefixed with NEXT_PUBLIC_).
 *   • Never commit the service account JSON to source control.
 *   • Never log the full key — at most log the client_email for debugging.
 *
 * This module must NEVER be imported from client code. It runs only on the
 * server (Route Handlers, Server Components, Server Actions).
 */

import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

let _adminApp: App | null = null;

function getAdminApp(): App {
  if (_adminApp) return _adminApp;

  // Already initialised (hot-reload safety)
  if (getApps().length > 0) {
    _adminApp = getApps()[0];
    return _adminApp;
  }

  const serviceAccountJSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJSON) {
    throw new Error(
      "[firebaseAdmin] FIREBASE_SERVICE_ACCOUNT_JSON env var is missing. " +
        "Set it in Vercel → Settings → Environment Variables (server-only, NOT NEXT_PUBLIC_)."
    );
  }

  let serviceAccount: Record<string, string>;
  try {
    serviceAccount = JSON.parse(serviceAccountJSON);
  } catch {
    throw new Error(
      "[firebaseAdmin] FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON. " +
        "Paste the entire contents of the downloaded service account key file."
    );
  }

  _adminApp = initializeApp({
    credential: cert(serviceAccount),
  });

  // Log only the client_email for deploy debugging — never the full key.
  console.log(
    `[firebaseAdmin] Admin SDK initialised for ${serviceAccount.client_email ?? "unknown"}`
  );

  return _adminApp;
}

/** Returns the Firebase Admin Auth instance (server-only). */
export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}
