# KeepCheck

KeepCheck is an installable, offline-first Progressive Web App (PWA) for discovering, logging, rating, and navigating to restaurants, coffee shops, bakeries, and food spots. Built on an offline-first architecture with IndexedDB (Dexie.js), Serwist service worker caching, and optional background multi-device cloud synchronization via Firebase and Cloudinary.

---

## Key Features

### 1. Offline-First Resilience
- **Dexie.js Single Source of Truth:** All reads and writes occur instantaneously against IndexedDB before syncing to the cloud. The app remains fully functional in airplane mode or spotty cellular connections.
- **Offline Session Continuity:** A cached session token allows returning users to access their full journal offline without being redirected to the landing page or login wall.
- **Conflict Resolution (LWW):** Timestamp-governed Last-Write-Wins with soft-deletion tombstones (`isDeleted: true`) prevents resurrection of deleted items upon reconnection.

### 2. Interactive Discovery Map & Zero-Key OSM Geospatial Stack
- **Name-First Place Search:** Fast autocomplete powered by the Photon API (`photon.komoot.io`), proximity-biased to the user's GPS coordinates.
- **Interactive POI Discovery:** Viewport-bounded Overpass API queries (`overpass-api.de`) surface real cafés, restaurants, and bakeries at zoom 15+ with in-memory caching and deduplication.
- **Draggable / Tap-to-Place "Adjust Pin":** Easily fine-tune imprecise pins or place street drops with an interactive map adjustment mode and reverse geocoding via Nominatim.
- **Opening Hours Status:** Parses OpenStreetMap `opening_hours` syntax safely to display live `Open now` / `Closed` badges in venue sheets and popovers.
- **Pedestrian & Driving Routing:** In-app route previews rendered via OSRM with distance and duration estimates, plus one-tap deep links to Google Maps and Waze.

### 3. Food Journaling, Menu Memory & Visit History
- **Repeat Visits:** Log multiple visits to the same venue with dates, notes, dish recommendations, spend, and ratings.
- **Dynamic Rating Recalculation:** Adding, modifying, or deleting visits automatically recomputes and updates the venue's overall displayed rating and latest visit date.
- **Menu Memory:** Track standout dishes with `Must order` and items to avoid with `Skip`.
- **Wishlist & Custom Collections:** Organize spots into collections or save unvisited places to a Wishlist without an initial rating.

### 4. Media & Cloud Synchronization
- **Photo Compression & Sync:** Visit photos are compressed client-side and uploaded to Cloudinary. Newly generated URLs persist directly to Firestore within the same sync cycle.
- **Dual-Layer Caching:** Serwist service worker implements `CacheFirst` for CARTO Voyager raster map tiles, `StaleWhileRevalidate` for Cloudinary photos, and `NetworkOnly` for authentication endpoints.
- **Branded Share Cards:** Render and share high-resolution editorial cards (`keepcheck-card.png`) directly to the Web Share API or download them locally.
- **Data Portability:** Full JSON backup and restore with transactional validation, plus CSV export in Journal Tools.

### 5. Mobile Ergonomics & PWA Experience
- **Touch-Friendly Controls:** Smooth bottom sheets, floating map controls, and thumb-reachable navigation designed for `100dvh` mobile viewports.
- **Subtle Install Prompts:** Native `beforeinstallprompt` support for Chrome/Android and clear, step-by-step instructions for iOS Safari (*"Tap Share → Add to Home Screen"*).

---

## Tech Stack

| Layer | Technologies |
| --- | --- |
| **Framework & Language** | Next.js 16 (App Router), React 19, TypeScript |
| **Styling** | Tailwind CSS v4 |
| **Local Database** | Dexie.js (IndexedDB wrapper), `dexie-react-hooks` |
| **Cloud Database & Auth** | Firebase Authentication, Cloud Firestore, NextAuth.js (Auth.js v5), Firebase Admin SDK |
| **Media Hosting** | Cloudinary |
| **PWA & Offline** | Serwist (`@serwist/next`) Service Worker |
| **Mapping & Routing** | Leaflet.js, CARTO Voyager Tiles, Photon API, Nominatim API, Overpass API, OSRM API |
| **Icons** | Lucide React |

---

## Getting Started

### Prerequisites
- Node.js 18+ or 20+
- npm, pnpm, or yarn

### 1. Clone & Install
```bash
git clone https://github.com/your-username/KeepCheck.git
cd KeepCheck
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
Fill in the required credentials in `.env.local`:
- **NextAuth (Auth.js v5):** Google OAuth credentials and session secret (`AUTH_SECRET`).
- **Firebase Admin:** Service account JSON for the server-side custom token bridge (`FIREBASE_SERVICE_ACCOUNT_JSON`).
- **Firebase Client:** Web app config (`NEXT_PUBLIC_FIREBASE_*`).
- **Cloudinary:** Cloud name and unsigned upload preset (`NEXT_PUBLIC_CLOUDINARY_*`).
- **CARTO Tiles (Optional):** Raster tile API key (`NEXT_PUBLIC_CARTO_API_KEY`).

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

> **Note:** Service worker caching is disabled during `npm run dev` to prevent stale hot-reload assets. To test full offline PWA behavior, run a production build.

### 4. Build & Run for Production
```bash
npm run build
npm run start
```

---

## Verification & Automated Tests

Run the full verification suite before committing:

```bash
# 1. Typecheck
npx tsc --noEmit

# 2. Lint
npm run lint

# 3. Geospatial & Map Regression Suite
npm run test:map

# 4. Journal, Migration & Sync Regression Suite
npm run test:journal

# 5. Production Next.js Build
npm run build
```

---

## Security Rules

- **Cloud Firestore:** Security policies for multi-device sync are maintained in `firestore.rules`.
- **Firebase Storage:** Security policies for legacy storage bucket access are maintained in `storage.rules`.

---

## License

MIT
