import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

// Tie precache revision to the deploy commit so cache invalidation is legible
// when debugging. Falls back to Date.now() for local builds.
const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? Date.now().toString();

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  additionalPrecacheEntries: [
    { url: "/", revision },
    { url: "/offline", revision },
  ],
});

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ["firebase-admin"],
};

export default withSerwist(nextConfig);
