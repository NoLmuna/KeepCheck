/**
 * Offline Sync Manager
 *
 * Coordinates syncing of locally-saved spots to Firestore when the device
 * comes back online. Works in tandem with Dexie (local DB) and Firestore.
 *
 * Strategy:
 *  1. When a spot is saved, it's ALWAYS written to Dexie first (instant).
 *  2. The Firestore write is attempted in the background (non-blocking).
 *  3. If the Firestore write fails (offline / network error), the spot's
 *     `pendingSync` flag stays `true` in Dexie.
 *  4. When the browser fires the `online` event, we sweep Dexie for any
 *     `pendingSync === true` rows and retry their Firestore writes.
 *  5. On success, `pendingSync` is cleared.
 *
 * For deletes that fail while offline, we queue them in localStorage
 * under a `keepcheck-pending-deletes` key and retry on reconnect.
 */

import { db, type FoodSpotLog } from "@/app/db";
import {
  writeSpotToFirestore,
  deleteSpotFromFirestore,
} from "./firestore";
import { uploadSpotImage, deleteSpotImage } from "./storage";

/* ------------------------------------------------------------------ */
/*  Pending-delete queue (localStorage-backed)                         */
/* ------------------------------------------------------------------ */

export interface PendingDelete {
  uid: string;
  firebaseId: string;
}

const PENDING_DELETES_KEY = "keepcheck-pending-deletes";

export function getPendingDeletes(): PendingDelete[] {
  try {
    const raw = localStorage.getItem(PENDING_DELETES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePendingDeletes(deletes: PendingDelete[]): void {
  try {
    localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(deletes));
  } catch {
    /* storage full — best effort */
  }
}

export function queuePendingDelete(uid: string, firebaseId: string): void {
  const current = getPendingDeletes();
  // Dedupe
  if (!current.some((d) => d.uid === uid && d.firebaseId === firebaseId)) {
    current.push({ uid, firebaseId });
    savePendingDeletes(current);
  }
}

/* ------------------------------------------------------------------ */
/*  Sync a single spot to Firestore                                    */
/* ------------------------------------------------------------------ */

/**
 * Attempt to sync a single pending spot to Firestore.
 * Returns `true` if successful, `false` if it should be retried later.
 *
 * Pre-checks `navigator.onLine` to avoid unnecessary Firestore errors
 * when clearly offline.
 */
export async function syncSpotToFirestore(
  uid: string,
  spot: FoodSpotLog,
): Promise<boolean> {
  if (!spot.firebaseId) return false;

  // Skip if we're clearly offline — saves error noise and CPU
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return false;
  }

  try {
    let downloadURL = spot.downloadURL;

    // If there's a local image for this spot, sync it too
    if (spot.id !== undefined) {
      const image = await db.images.where("spotId").equals(spot.id).first();
      if (image && !image.firebaseId) {
        try {
          downloadURL = await uploadSpotImage(uid, spot.firebaseId, image.blob);
          // Mark image as synced
          await db.images.update(image.id!, { firebaseId: "uploaded" });
          // Update local spot with downloadURL
          await db.spots.update(spot.id, { downloadURL });
        } catch (imgErr) {
          console.warn("[OfflineSync] Image sync failed, will retry:", imgErr);
          // Don't fail the whole spot sync for an image failure
        }
      }
    }

    // Write the spot document
    await writeSpotToFirestore(uid, spot.firebaseId, {
      name: spot.name,
      category: spot.category,
      rating: spot.rating,
      comment: spot.comment,
      createdAt: spot.createdAt,
      thumbnail: spot.thumbnail,
      downloadURL,
    });

    // Mark spot as synced
    if (spot.id !== undefined) {
      await db.spots.update(spot.id, { pendingSync: false });
    }

    console.log(`[OfflineSync] ✓ Synced spot "${spot.name}" (${spot.firebaseId})`);
    return true;
  } catch (err) {
    console.warn(`[OfflineSync] ✗ Sync failed for "${spot.name}":`, err);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Sweep: retry ALL pending spots + deletes                           */
/* ------------------------------------------------------------------ */

let _sweepInProgress = false;

/**
 * Retry all pending spots and deletes. De-duped so only one sweep
 * runs at a time. Each item is wrapped in its own try/catch so one
 * failure doesn't block the rest.
 */
export async function sweepPendingSync(uid: string): Promise<number> {
  if (_sweepInProgress) return 0;

  // Don't even attempt if clearly offline
  if (typeof navigator !== "undefined" && !navigator.onLine) return 0;

  _sweepInProgress = true;

  let synced = 0;

  try {
    // 1. Sync pending spots
    const pendingSpots = await db.spots
      .where("pendingSync")
      .equals(1) // Dexie stores booleans as 0/1 in indexes
      .toArray();

    // Also check for `true` value (non-indexed fallback)
    const allUserSpots = await db.spots.where("userId").equals(uid).toArray();
    const pending = allUserSpots.filter((s) => s.pendingSync === true);

    // Merge & dedupe
    const spotsToSync = new Map<number, FoodSpotLog>();
    for (const s of [...pendingSpots, ...pending]) {
      if (s.id !== undefined) spotsToSync.set(s.id, s);
    }

    for (const spot of spotsToSync.values()) {
      try {
        const ok = await syncSpotToFirestore(uid, spot);
        if (ok) synced++;
      } catch (spotErr) {
        // Per-item catch: don't let one failure block the rest
        console.warn(`[OfflineSync] Per-item sync error for "${spot.name}":`, spotErr);
      }
    }

    // 2. Retry pending deletes
    const deletes = getPendingDeletes();
    const remaining: PendingDelete[] = [];

    for (const del of deletes) {
      if (del.uid !== uid) {
        remaining.push(del);
        continue;
      }
      try {
        await deleteSpotImage(del.uid, del.firebaseId);
        await deleteSpotFromFirestore(del.uid, del.firebaseId);
        console.log(`[OfflineSync] ✓ Deleted spot ${del.firebaseId} from Firestore`);
      } catch {
        remaining.push(del);
      }
    }

    savePendingDeletes(remaining);

    if (synced > 0) {
      console.log(`[OfflineSync] Sweep complete: ${synced} spot(s) synced.`);
    }
  } finally {
    _sweepInProgress = false;
  }

  return synced;
}

/* ------------------------------------------------------------------ */
/*  Online/offline event wiring                                        */
/* ------------------------------------------------------------------ */

type OnlineStatusCallback = (online: boolean) => void;
type SyncCompleteCallback = (syncedCount: number) => void;

let _cleanupFn: (() => void) | null = null;

/**
 * Start listening for online/offline events.
 * When the browser comes back online, automatically sweep pending syncs.
 *
 * Returns a cleanup function to remove event listeners.
 */
export function startOnlineListener(
  uid: string,
  onStatusChange?: OnlineStatusCallback,
  onSyncComplete?: SyncCompleteCallback,
): () => void {
  // Clean up previous listener if any
  if (_cleanupFn) _cleanupFn();

  const handleOnline = async () => {
    console.log("[OfflineSync] 🌐 Back online — sweeping pending syncs…");
    onStatusChange?.(true);

    // Small delay to let network stabilize
    await new Promise((r) => setTimeout(r, 1500));

    const synced = await sweepPendingSync(uid);
    onSyncComplete?.(synced);
  };

  const handleOffline = () => {
    console.log("[OfflineSync] 📡 Gone offline");
    onStatusChange?.(false);
  };

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  // Fire initial status
  onStatusChange?.(navigator.onLine);

  // If we're online on mount, do a sweep in case there are stale pending items
  if (navigator.onLine) {
    sweepPendingSync(uid).then((synced) => {
      if (synced > 0) onSyncComplete?.(synced);
    });
  }

  _cleanupFn = () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };

  return _cleanupFn;
}
