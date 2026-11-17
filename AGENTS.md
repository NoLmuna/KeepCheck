# AGENTS.md

## Project Overview
**KeepCheck** is an installable, offline-first Progressive Web App (PWA) for discovering, logging, rating, and navigating to restaurants, coffee shops, bakeries, and food spots.

### Core Product Principles
1. **Offline-First Resilience:** Users frequently log spots inside cafés or dense areas with poor cellular reception. Every read and write operation must work instantaneously offline against local storage before syncing to the cloud.
2. **Venue-First Mapping (Beyond Raw Pins):** The map must surface real restaurants and coffee shops directly—supporting name-first search, interactive Point of Interest (POI) discovery, proximity sorting, and turn-by-turn routing—rather than acting solely as a passive coordinate pin-dropper.
3. **Mobile-First Ergonomics:** Designed primarily for one-handed mobile usage with smooth bottom drawers, thumb-reachable controls, and zero-jank map interactions.

---

## Tech Stack & Ecosystem
- **Framework:** Next.js (App Router) with React and strict TypeScript
- **Styling:** Tailwind CSS (mobile-first responsive utilities, dynamic viewport units)
- **Local Database:** Dexie.js (IndexedDB wrapper) as the primary client-side source of truth
- **Cloud Backend & Auth:** Firebase Authentication and Cloud Firestore for multi-device synchronization
- **PWA & Caching:** Serwist / Service Worker for app-shell precaching, runtime asset caching, and offline availability
- **Mapping & Geospatial Services (Zero-Key OpenStreetMap Stack):**
  - **Map Rendering:** Leaflet.js (`leaflet`, `react-leaflet` or direct imperative Leaflet refs)
  - **Forward Geocoding (Autocomplete Search):** Photon API (`[https://photon.komoot.io/api/](https://photon.komoot.io/api/)`)
  - **Reverse Geocoding (Pin-to-Address):** Nominatim API (`[https://nominatim.openstreetmap.org/reverse](https://nominatim.openstreetmap.org/reverse)`)
  - **Live POI Discovery:** Overpass API (`[https://overpass-api.de/api/interpreter](https://overpass-api.de/api/interpreter)`)
  - **In-App Routing:** OSRM Public Routing API (`[https://router.project-osrm.org/route/v1/](https://router.project-osrm.org/route/v1/)`)

---

## Data & Offline Synchronization Rules

### 1. Local-First Read/Write Lifecycle
- **Dexie.js is the single source of truth for the UI.** Components must read from IndexedDB (e.g., via `useLiveQuery`) rather than waiting on Firestore network calls.
- **Non-Blocking Mutations:** Creating, updating, or deleting a spot writes immediately to Dexie with `syncStatus: 'pending'` and an updated `updatedAt` Unix timestamp.
- **Background Cloud Sync:** When authenticated and online (`navigator.onLine === true`), a background sync worker pushes `'pending'` local records to Firestore and pulls remote changes newer than the last local sync checkpoint.
- **Conflict Resolution:** Use Last-Write-Wins (LWW) governed by `updatedAt` timestamps. Soft-delete records (`isDeleted: true`) locally until the deletion is acknowledged by Firestore so deleted items do not resurrect during sync.

### 2. Offline Geospatial Persistence
- **Persist Human-Readable Location Data at Save Time:** Always store `formattedAddress`, `locality`, and `osmId` (when available) directly inside the Dexie `Spot` record upon creation. Never rely on live reverse-geocoding to render saved spot cards offline.
- **Graceful Network Degradation:** If external geocoding, POI, or routing requests fail due to offline status or rate limits, fall back cleanly to raw coordinates (`lat, lng`) and straight-line Haversine distance calculations without throwing unhandled UI errors.

### 3. Core Data Contract
```ts
export type SpotCategory = 'coffee' | 'restaurant' | 'bakery' | 'bar' | 'other';

export interface SpotLocation {
  lat: number;
  lng: number;
  formattedAddress: string;
  locality?: string;
  osmId?: string;
}

export interface Spot {
  id: string;
  userId?: string;
  name: string;
  category: SpotCategory;
  rating: number; // 1 to 5
  notes?: string;
  tags?: string[];
  photoUrls?: string[];
  location: SpotLocation;
  visitedAt: number;
  createdAt: number;
  updatedAt: number;
  syncStatus: 'synced' | 'pending' | 'error';
  isDeleted?: boolean;
}
```

---

## Map, Venue Discovery & Navigation Standards

### 1. SSR & Leaflet Lifecycle Safety
- Leaflet accesses `window` and `document` on import. Always load map components dynamically with `{ ssr: false }`.
- Clean up all Leaflet map instances (`map.remove()`), custom layers, debounced timers, and `navigator.geolocation.watchPosition` IDs inside `useEffect` cleanup functions to prevent memory leaks and duplicate map container initialization errors.

### 2. Name-First Place Search & Reverse Geocoding
- **Proximity-Biased Autocomplete:** Pass the user's active GPS coordinates (`lat`, `lon`) into Photon API queries so local cafés and restaurants appear first. Debounce search input by at least `300ms` and cancel stale requests using `AbortController`.
- **Manual Pin Resolution:** When a user taps an arbitrary spot on the map, trigger a reverse-geocode lookup via Nominatim to populate the street address and neighborhood/city. Respect Nominatim's 1-request-per-second usage policy and include a descriptive `User-Agent` or `Referer`.

### 3. Interactive Restaurant & Coffee Shop POI Layer
- **Zoom-Gated Fetching:** Only query the Overpass API for `amenity~"cafe|restaurant|bakery|fast_food"` when `map.getZoom() >= 15` to avoid heavy payloads and timeouts.
- **Debounced Viewport Queries:** Trigger Overpass fetches on `moveend` with a `500ms–700ms` debounce, deduplicating fetched POIs by `osmId` in memory or IndexedDB cache.
- **Direct Venue Interaction:** Render distinct category icons (`L.divIcon`) for discovered venues. Tapping a discovered POI must open a preview sheet displaying its name, category/cuisine, and a one-tap **"Log This Spot"** action that pre-fills the creation form.

### 4. Live GPS Context, Proximity Sorting & Routing
- **Live User Marker:** Render a pulsing user location dot alongside a translucent accuracy radius (`L.circle`).
- **Haversine Distance Sorting:** Compute real-time distance between the user's current coordinates and every saved `Spot` to support sorting by **"Nearest to Me"** and displaying formatted distances (`"240 m away"`, `"1.4 km away"`).
- **In-App Route Preview:** Fetch GeoJSON walking/driving routes from OSRM (`overview=full&geometries=geojson`) and draw an `L.geoJSON` polyline on the map with estimated travel duration.
- **External Turn-by-Turn Handoff:** Every venue sheet must offer one-tap deep links to launch native navigation apps:
  - Google Maps: `[https://www.google.com/maps/dir/?api=1&destination=$](https://www.google.com/maps/dir/?api=1&destination=$){lat},${lng}`
  - Waze: `[https://waze.com/ul?ll=$](https://waze.com/ul?ll=$){lat},${lng}&navigate=yes`

---

## Coding Conventions & Engineering Practices

- **Strict TypeScript:** Avoid `any`. Define explicit interfaces for all API responses (Photon GeoJSON features, Overpass elements, OSRM routes) and map them into clean internal domain types inside dedicated service modules.
- **Separation of Concerns:** Keep geospatial math (Haversine distance, bounding-box padding), external API fetchers, and Dexie/Firestore sync logic isolated in pure TypeScript modules and custom React hooks—never inside JSX view components.
- **Idempotent Network Calls:** Always pass `AbortSignal` into `fetch` calls triggered by rapid map panning or search typing.
- **Environment & Secret Hygiene:** Never hardcode Firebase config keys; read exclusively from `NEXT_PUBLIC_FIREBASE_*` environment variables and guard initialization when variables are missing during build/CI runs.

---

## UI/UX & Accessibility Guidelines

- **Bottom Sheets Over Map Popups:** Do not rely on default Leaflet white popups for rich venue details. Use a mobile-friendly bottom drawer/sheet synced bidirectionally with the active map marker (`map.flyTo([lat, lng], 17)` on card selection; highlight card and expand sheet on marker tap).
- **Viewport Stability:** Use `h-[100dvh]` rather than `100vh` for full-screen map views so mobile browser address bars do not clip bottom navigation or action sheets.
- **Status Transparency:** Surface subtle, non-intrusive badges for **Offline Mode**, **Pending Sync Count**, and **GPS Signal Status** so users always trust whether their data is saved locally or synced to the cloud.
- **Accessibility:** Ensure all custom map controls, filter chips, rating stars, and marker buttons have explicit `aria-label` attributes, visible focus rings, and minimum `44x44px` touch targets.

---

## Agent Guardrails & Verification Checklist

### Strict Prohibitions
- **Do NOT** introduce paid or API-key-required mapping SDKs (e.g., Google Maps JS SDK, Mapbox GL) unless explicitly instructed by the user.
- **Do NOT** gate spot creation, editing, or map viewing behind an active internet connection or mandatory login wall—guest/local-only usage via Dexie must always function seamlessly.
- **Do NOT** modify project folder structures or reorganize directories without explicit approval.

### Before Completing Any Task
1. Verify there are zero TypeScript errors (`npx tsc --noEmit`).
2. Confirm no SSR crashes occur when rendering map routes (`npm run build`).
3. Validate that newly added features degrade gracefully when `navigator.onLine` is `false` or when external OSM endpoints return non-200 responses.
4. Ensure all map event listeners, timers, and geolocation watchers are properly torn down on component unmount.