import { defaultCache } from "@serwist/next/worker";
import { type PrecacheEntry, Serwist, cacheNames, StaleWhileRevalidate, ExpirationPlugin } from "serwist";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Force immediate activation — don't wait for existing tabs to close.
  skipWaiting: true,
  // Take control of all open clients immediately after activation,
  // so users never need a manual refresh to get the new SW.
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: /^https:\/\/lh[0-9]*\.googleusercontent\.com\/.*/i,
      handler: new StaleWhileRevalidate({
        cacheName: "google-user-avatars",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 50,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
            maxAgeFrom: "last-used",
          }),
        ],
      }),
    },
    ...defaultCache,
  ],
  // Serve the precached /offline page when a NetworkFirst handler fails
  // for a navigation request (e.g. deep link the user has never visited).
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

// Register all Serwist-managed listeners (install, activate, fetch, etc.)
serwist.addEventListeners();

// ---------------------------------------------------------------------------
// Cache-busting: purge stale caches from previous builds on every activation.
//
// Serwist names its precache bucket deterministically. Any cache name that
// doesn't belong to the current Serwist instance is leftover from an older
// build and can safely be deleted. This prevents the app from ever serving
// mismatched / broken assets after a deployment.
// ---------------------------------------------------------------------------
self.addEventListener("activate", (event) => {
  // Serwist's internal precache name — used to identify "our" cache.
  const currentPrecacheName = cacheNames.precache;

  event.waitUntil(
    caches.keys().then((cacheKeys) =>
      Promise.all(
        cacheKeys
          .filter((name) => {
            // Keep the current precache and any Serwist runtime caches.
            // Delete everything else (old precache buckets, orphaned caches).
            return name !== currentPrecacheName && !name.startsWith("serwist");
          })
          .map((staleCache) => {
            console.log(`[SW] Deleting stale cache: ${staleCache}`);
            return caches.delete(staleCache);
          }),
      ),
    ),
  );
});
