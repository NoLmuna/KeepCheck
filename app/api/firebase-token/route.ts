export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAdminAuth } from "@/lib/firebaseAdmin";

/**
 * POST /api/firebase-token
 *
 * UID-Continuity Bridge: Converts a NextAuth session → Firebase custom token.
 *
 * Flow:
 *   1. Verify the caller has a valid NextAuth session.
 *   2. Extract email from the session.
 *   3. Look up the EXISTING Firebase user by email (getUserByEmail).
 *      - If found → use that uid.  This is CRITICAL: existing Firestore data
 *        (spots, images, etc.) is scoped to the uid that Firebase originally
 *        generated for this Google account.  If we created a new uid instead,
 *        all existing data would be orphaned and invisible to the user.
 *      - If NOT found → this is a genuinely new user who has never signed in.
 *        Create a new Firebase user (createUser) and use the resulting uid.
 *   4. Mint a custom token for that uid and return it.
 *
 * The client calls signInWithCustomToken(auth, customToken) to establish
 * the Firebase session, which populates Firestore security-rules' request.auth.
 */
export async function POST() {
  // 1. Verify NextAuth session
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  const { email, name, image } = session.user;
  const adminAuth = getAdminAuth();

  try {
    let uid: string;

    // 2. Look up existing Firebase user by email FIRST.
    //
    // WHY THIS MATTERS:
    // Firebase Auth originally assigned a uid when this user first signed in
    // via signInWithPopup/signInWithRedirect. All their Firestore documents
    // (users/{uid}/spots/...) and Storage paths are keyed to that uid.
    // If we skip this lookup and always call createUser(), the new user record
    // gets a DIFFERENT uid, and every existing spot/image becomes unreachable.
    try {
      const existingUser = await adminAuth.getUserByEmail(email);
      uid = existingUser.uid;
    } catch (lookupError: unknown) {
      // auth/user-not-found means this is a genuinely new user.
      const code = (lookupError as { code?: string })?.code;
      if (code === "auth/user-not-found") {
        const newUser = await adminAuth.createUser({
          email,
          displayName: name ?? undefined,
          photoURL: image ?? undefined,
        });
        uid = newUser.uid;
      } else {
        // Unexpected error — re-throw.
        throw lookupError;
      }
    }

    // 3. Mint custom token
    const customToken = await adminAuth.createCustomToken(uid);

    return NextResponse.json({ customToken });
  } catch (error) {
    console.error("[firebase-token] Error minting custom token:", error);
    return NextResponse.json(
      { error: "Failed to create Firebase token" },
      { status: 500 }
    );
  }
}
