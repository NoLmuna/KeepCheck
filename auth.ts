import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Auth.js v5 (NextAuth) configuration.
 *
 * NextAuth handles ONLY the Google OAuth handshake. It does NOT manage a user
 * database — we use JWT sessions so NextAuth never needs its own DB tables.
 * After NextAuth confirms the user's Google identity, the client exchanges the
 * session for a Firebase custom token via /api/firebase-token, so Firebase Auth
 * + Firestore remain the sole account/data backend.
 *
 * MANUAL SETUP REQUIRED:
 * 1. Create a Google OAuth Client ID + Secret in Google Cloud Console
 *    (separate from Firebase's auto-created one).
 *    Authorized redirect URIs:
 *      - http://localhost:3000/api/auth/callback/google  (dev)
 *      - https://<your-vercel-domain>/api/auth/callback/google  (prod)
 * 2. Set env vars: AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_SECRET
 *    (AUTH_SECRET can be generated via `npx auth secret`)
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],

  // JWT session strategy — no database adapter needed.
  session: { strategy: "jwt" },

  // Redirect auth errors to our login page instead of NextAuth's built-in
  // error page (which was returning a 500).
  pages: {
    signIn: "/login",
    error: "/login",
  },

  callbacks: {
    /** Persist user info from the OAuth profile into the JWT. */
    async jwt({ token, profile }) {
      if (profile) {
        token.email = profile.email;
        token.name = profile.name;
        token.picture = profile.picture;
      }
      return token;
    },

    /** Expose the user info from the JWT in the session object. */
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
      }
      return session;
    },
  },
});
