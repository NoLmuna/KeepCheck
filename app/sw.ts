import { defaultCache } from "@serwist/next/worker";
import {
  type PrecacheEntry,
  Serwist,
  cacheNames,
  StaleWhileRevalidate,
  CacheFirst,
  NetworkOnly,
  ExpirationPlugin,
} from "serwist";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

// Caching rule for OpenStreetMap tile requests.
// OSM tiles are fetched from URLs matching "tile.openstreetmap.org".
// We use a CacheFirst strategy so tiles are read from cache offline.
// Note: map tiles become available offline only for areas the user has already viewed while online (opportunistic caching) — not a pre-downloaded full region.
const osmTileCacheRule = {
  matcher: /tile\.openstreetmap\.org/i,
  handler: new CacheFirst({
    cacheName: "openstreetmap-tiles",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 1000,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        maxAgeFrom: "last-used",
      }),
    ],
  }),
};

// CARTO Voyager map tiles caching rule for smooth offline panning in visited neighborhoods.
const cartoVoyagerTileCacheRule = {
  matcher: /basemaps\.cartocdn\.com/i,
  handler: new CacheFirst({
    cacheName: "carto-voyager-tiles",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 1500,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        maxAgeFrom: "last-used",
      }),
    ],
  }),
};

// Synced Cloudinary photos caching rule so cross-device photos viewed once online remain visible offline.
const cloudinaryPhotoCacheRule = {
  matcher: /^https:\/\/res\.cloudinary\.com\/.*/i,
  handler: new StaleWhileRevalidate({
    cacheName: "cloudinary-synced-photos",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 250,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        maxAgeFrom: "last-used",
      }),
    ],
  }),
};

// Auth and API endpoints must always be NetworkOnly ahead of defaultCache so responses are never cached.
const authApiNetworkOnlyRule = {
  matcher: ({ url }: { url: URL }) =>
    url.pathname.startsWith("/api/auth/") ||
    url.pathname === "/api/firebase-token" ||
    url.pathname === "/api/feedback",
  handler: new NetworkOnly(),
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
    authApiNetworkOnlyRule,
    osmTileCacheRule,
    cartoVoyagerTileCacheRule,
    cloudinaryPhotoCacheRule,
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
  const preservedCaches = [
    "openstreetmap-tiles",
    "carto-voyager-tiles",
    "cloudinary-synced-photos",
    "google-user-avatars",
  ];

  event.waitUntil(
    caches.keys().then((cacheKeys) =>
      Promise.all(
        cacheKeys
          .filter((name) => {
            // Keep the current active precache, current active runtime cache, and persistent user media/tiles.
            // Delete all older precache buckets and stale runtime caches from previous builds.
            return (
              name !== currentPrecacheName &&
              name !== cacheNames.runtime &&
              !preservedCaches.includes(name)
            );
          })
          .map((staleCache) => {
            console.log(`[SW] Deleting stale cache: ${staleCache}`);
            return caches.delete(staleCache);
          }),
      ),
    ),
  );
});
