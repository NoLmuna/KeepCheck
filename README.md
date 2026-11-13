# KeepCheck

A Progressive Web App for logging and rating food and drink spots. Built offline-first with local IndexedDB storage and optional real-time cloud sync via Firebase. Works on desktop and mobile, with or without an internet connection.

## Features

- **Offline-First Storage** — All data is written instantly to IndexedDB (via Dexie.js) so the app works without a network. A service worker caches the app shell for full offline reliability.
- **Cloud Sync** — Sign in with Google to sync spots and images across devices in real-time through Firestore. Offline edits queue automatically and sync when connectivity returns.
- **Interactive Maps** — View logged spots on a Leaflet/OpenStreetMap view. Pick a location by tapping the map or use device GPS to auto-detect coordinates.
- **Image Support** — Attach photos to spots. Images are compressed locally for thumbnails and cached in IndexedDB at full resolution.
- **Search, Filter, and Sort** — Text search with debounce, category filters (Cafe, Restaurant), sort by date or rating, and toggle between list and grid views.
- **Toast Notifications** — All user actions (logging, deleting, signing in/out, syncing, errors) surface as brief toast notifications instead of alerts or silent failures.
- **PWA Installable** — Can be installed to the home screen on mobile or as a desktop app through the browser.

## Tech Stack

| Technology | Role |
| --- | --- |
| Next.js 16 (App Router) | Framework and routing |
| Dexie.js | IndexedDB wrapper for local storage |
| Firebase Auth + Firestore | Authentication and cloud database |
| NextAuth.js v5 | OAuth session management |
| Tailwind CSS v4 | Styling and theming |
| GSAP | Animations |
| Leaflet.js | Map rendering |
| Serwist | Service worker and PWA support |

## Project Structure

```
app/
  api/              Server routes (auth callback, token exchange)
  login/            Sign-in page
  map/              Full-page map view
  offline/          Offline fallback page
  db.ts             IndexedDB schema
  globals.css       Theme tokens and animations
  layout.tsx        Root layout (providers)
  page.tsx          Main application page

components/
  AuthGuard.tsx           Auth-protected wrapper
  LocationPickerMap.tsx   Map pin selector
  LocationPickerModal.tsx Modal for picking a location
  SpotDetailModal.tsx     Full-res photo viewer
  SpotsMap.tsx            Map with spot markers

lib/
  auth.tsx          Auth context (NextAuth + Firebase bridge)
  firebase.ts       Firebase client setup
  firestore.ts      Firestore read/write helpers
  offlineSync.ts    Offline queue and reconnection sync
  toast.tsx         Global toast notification provider

utils/
  image.ts          Image compression and resizing
```

## Setup

### Prerequisites

- Node.js 18 or later
- npm (or yarn / pnpm / bun)

### 1. Clone and install

```bash
git clone https://github.com/yourusername/keepcheck.git
cd keepcheck
npm install
```

### 2. Configure environment

Create a `.env.local` file in the project root:

```env
# NextAuth
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# Firebase (client)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin (server-side token exchange)
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How It Works

1. When you log a spot, the data is written to IndexedDB immediately. If you are signed in and online, it also writes to Firestore in the background.
2. If you are offline, spots are flagged as pending. When the app detects connectivity, it runs a sync sweep to push pending records to Firestore.
3. Firestore snapshot listeners keep your local database in sync with cloud changes from other devices.
4. Images are stored as blobs in IndexedDB and as compressed base64 strings in Firestore.

## License

MIT

## Venue discovery map

Open `/map` to search by venue name, tap nearby food venues (zoom 15+), or drop a pin. GPS enables proximity sorting and route previews. Guests can save and edit locally without signing in. Venue addresses and OSM identifiers are stored in IndexedDB; older coordinate-only records migrate without changing IDs, photos, categories, or 1–10 ratings.

Photon powers search, Nominatim resolves manual pins, and Overpass supplies nearby venues (including `shop=bakery`). Driving previews use the OSRM demo; walking previews use FOSSGIS's separately prepared public OSRM pedestrian graph at `routing.openstreetmap.de/routed-foot`. Changing the profile token on a driving graph does not produce a pedestrian route. All requests have cancellation, timeouts, and offline/error fallbacks. Reverse lookup and route requests are rate-limited; viewport discovery is debounced and cached in memory.

Saved places, editing, coordinate pinning, straight-line distances, and previously cached map tiles work offline after loading the PWA online. New search results, new tiles, discovery, and route calculation require connectivity. Guest records remain local; account-owned records synchronize in the background with timestamp-based conflict resolution and deletion tombstones.

Validation:

```sh
npm run test:map
npx tsc --noEmit
npm run build
```

The map regression suite covers the v6-to-v7 migration, location metadata round trips, offline/non-200 fallbacks, POI deduplication/cache, routing endpoint selection, and sync races. Browser checks should also cover GPS denial, search/POI selection, route dismissal, guest edits, and offline reloads against a production build (`npm run start`); service workers are disabled in development.
