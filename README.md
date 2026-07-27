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
