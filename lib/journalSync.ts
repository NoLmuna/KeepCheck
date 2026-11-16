import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  runTransaction,
  type Unsubscribe,
} from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";
import { db, type FoodSpotLog, type SpotImage } from "@/app/db";
import { getFirebaseApp, getFirebaseFirestore } from "./firebase";
import type { Spot, VisitLog, SpotCollection, SyncRecord } from "./models";
import { migrateLegacyRecords } from "./legacyMigration";
import { compressVisitPhoto } from "./journalMedia";
import { haversine } from "./geo";

type Kind = "venues" | "visitLogs" | "collections";
type RecordData = Spot | VisitLog | SpotCollection;
const kinds: Kind[] = ["venues", "visitLogs", "collections"];
function table(kind: Kind) {
  return db.table<RecordData, string>(kind);
}
export async function associateLocalRecordsWithUser(uid: string): Promise<number> {
  let count = 0;
  await db.transaction(
    "rw",
    [db.venues, db.visitLogs, db.collections, db.photoQueue],
    async () => {
      const unownedVenues = await db.venues
        .filter((v) => !v.userId || v.userId === "")
        .toArray();
      for (const v of unownedVenues) {
        await db.venues.put({
          ...v,
          userId: uid,
          syncStatus: "pending",
          updatedAt: Date.now(),
        });
        count++;
      }
      const unownedVisits = await db.visitLogs
        .filter((v) => !v.userId || v.userId === "")
        .toArray();
      for (const v of unownedVisits) {
        await db.visitLogs.put({
          ...v,
          userId: uid,
          syncStatus: "pending",
          updatedAt: Date.now(),
        });
        count++;
      }
      const unownedCollections = await db.collections
        .filter((c) => !c.userId || c.userId === "")
        .toArray();
      for (const c of unownedCollections) {
        await db.collections.put({
          ...c,
          userId: uid,
          syncStatus: "pending",
          updatedAt: Date.now(),
        });
        count++;
      }
      const unownedPhotos = await db.photoQueue
        .filter((p) => !p.userId || p.userId === "")
        .toArray();
      for (const p of unownedPhotos) {
        await db.photoQueue.put({ ...p, userId: uid });
        count++;
      }
    },
  );
  return count;
}

export async function mergeJournalRecords(
  kind: Kind,
  records: RecordData[],
  uid: string,
) {
  await db.transaction("rw", table(kind), async () => {
    for (const record of records) {
      if (
        record.userId !== uid ||
        !record.id ||
        !Number.isFinite(record.updatedAt)
      )
        continue;
      const old = await table(kind).get(record.id);
      if (old?.userId && old.userId !== uid) continue;
      if (!old || old.updatedAt <= record.updatedAt)
        await table(kind).put({ ...record, syncStatus: "synced" });
    }
  });
}
async function importLegacyCloud(uid: string) {
  const key = `legacy-cloud-${uid}`;
  if (await db.syncState.get(key)) return;
  const snapshot = await getDocs(
    collection(getFirebaseFirestore(), "users", uid, "spots"),
  );
  const records = snapshot.docs.map(
    (d, index) =>
      ({
        ...d.data(),
        id: index + 1,
        firebaseId: d.id,
        userId: uid,
      }) as FoodSpotLog,
  );
  const imagesSnapshot = await getDocs(
    collection(getFirebaseFirestore(), "users", uid, "images"),
  );
  const images: SpotImage[] = [];
  for (const document of imagesSnapshot.docs) {
    const image = document.data() as {
      spotFirebaseId?: string;
      base64?: string;
      createdAt?: number;
    };
    const parent = records.find((r) => r.firebaseId === image.spotFirebaseId);
    if (!parent?.id || !image.base64) continue;
    const match = image.base64.match(
      /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/,
    );
    if (!match) continue;
    const blob = new Blob(
      [Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0))],
      { type: match[1] },
    );
    images.push({
      id: images.length + 1,
      spotId: parent.id,
      firebaseId: document.id,
      blob,
      createdAt: image.createdAt ?? parent.createdAt,
    });
  }
  const converted = migrateLegacyRecords(records, images);
  await db.transaction(
    "rw",
    db.venues,
    db.visitLogs,
    db.photoQueue,
    db.syncState,
    async () => {
      const existingSpots = await db.venues
        .where("userId")
        .equals(uid)
        .toArray();
      const mapping = new Map<string, string>();
      for (const spot of converted.spots) {
        const existing = existingSpots.find(
          (s) =>
            s.id === spot.id ||
            (!s.isDeleted &&
              !spot.isDeleted &&
              !s.locationMissing &&
              !spot.locationMissing &&
              ((s.location.osmId && s.location.osmId === spot.location.osmId) ||
                (s.name.toLowerCase() === spot.name.toLowerCase() &&
                  haversine(s.location, spot.location) < 50))),
        );
        mapping.set(spot.id, existing?.id ?? spot.id);
        if (!existing) await db.venues.add(spot);
      }
      for (const visit of converted.visits) {
        const existing = await db.visitLogs.get(visit.id);
        const spotId = mapping.get(visit.spotId) ?? visit.spotId;
        if (!existing) await db.visitLogs.add({ ...visit, spotId });
        else if (!existing.localPhotoIds.length && visit.localPhotoIds.length)
          await db.visitLogs.update(existing.id, {
            localPhotoIds: visit.localPhotoIds,
            updatedAt: Math.max(Date.now(), existing.updatedAt + 1),
            syncStatus: "pending",
          });
      }
      for (const photo of converted.photos) {
        const parent = await db.visitLogs.get(photo.visitLogId);
        if (
          parent?.localPhotoIds.includes(photo.id) &&
          !(await db.photoQueue.get(photo.id))
        )
          await db.photoQueue.add({ ...photo, spotId: parent.spotId });
      }
      for (const id of new Set(mapping.values())) {
        const logs = await db.visitLogs
          .where("spotId")
          .equals(id)
          .filter((v) => !v.isDeleted)
          .toArray();
        const venue = await db.venues.get(id);
        if (!venue || venue.isDeleted) continue;
        const firstPhoto = logs.flatMap((v) => v.localPhotoIds)[0];
        await db.venues.update(id, {
          overallRating: logs.length
            ? logs.reduce((n, v) => n + v.rating, 0) / logs.length
            : undefined,
          localCoverPhotoId: venue.localCoverPhotoId ?? firstPhoto,
          updatedAt: Math.max(Date.now(), venue.updatedAt + 1),
          syncStatus: "pending",
        });
      }
      await db.syncState.put({ id: key, updatedAt: Date.now() });
    },
  );
}

function clean(record: RecordData): Record<string, unknown> {
  return JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
}
async function push(kind: Kind, record: RecordData, uid: string) {
  const reference = doc(getFirebaseFirestore(), "users", uid, kind, record.id);
  const winner = await runTransaction(getFirebaseFirestore(), async (tx) => {
    const snapshot = await tx.get(reference);
    const remote = snapshot.data() as RecordData | undefined;
    if (remote && remote.updatedAt > record.updatedAt)
      return { ...remote, id: record.id, userId: uid };
    tx.set(reference, { ...clean(record), userId: uid, syncStatus: "synced" });
    return null;
  });
  if (winner) {
    await mergeJournalRecords(kind, [winner], uid);
  } else {
    await db.transaction("rw", table(kind), async () => {
      const current = await table(kind).get(record.id);
      if (current && current.updatedAt <= record.updatedAt)
        await table(kind).put({ ...current, syncStatus: "synced", userId: uid });
    });
  }
}
async function uploadPhotos(uid: string, signal: AbortSignal) {
  const queued = await db.photoQueue
    .where("userId")
    .equals(uid)
    .filter((p) => p.status === "pending")
    .toArray();
  if (!queued.length) return;
  if (!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)
    throw new Error(
      "Photo uploads pending: Firebase Storage is not configured.",
    );
  const storage = getStorage(getFirebaseApp());
  storage.maxUploadRetryTime = 6000;
  storage.maxOperationRetryTime = 4000;
  for (const photo of queued) {
    if (signal.aborted || !navigator.onLine) return;
    const parent = await db.visitLogs.get(photo.visitLogId);
    const spot = await db.venues.get(photo.spotId);
    if (!parent || !spot || parent.isDeleted || spot.isDeleted) {
      await db.photoQueue.update(photo.id, {
        status: "failed",
        error: "Parent visit or venue deleted",
      });
      continue;
    }
    if (!photo.blob) {
      await db.photoQueue.update(photo.id, {
        status: "failed",
        error: "Missing image data",
      });
      continue;
    }
    try {
      const reference = ref(storage, `users/${uid}/journal/${photo.id}`);
      const task = uploadBytesResumable(reference, photo.blob, {
        contentType: photo.blob.type,
      });
      if (typeof (task as unknown as { catch?: unknown }).catch === "function") {
        (task as unknown as Promise<unknown>).catch(() => {});
      }
      const cancel = () => {
        try {
          task.cancel();
        } catch {}
      };
      signal.addEventListener("abort", cancel, { once: true });
      const timeout = setTimeout(cancel, 10000);
      try {
        await task;
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener("abort", cancel);
      }
      if (signal.aborted) return;
      const url = await getDownloadURL(reference);
      const thumbnail =
        photo.thumbnail ?? (await compressVisitPhoto(photo.blob)).thumbnail;
      // Retain a small offline preview; release the full compressed blob only after parent URLs are durable locally.
      await db.transaction(
        "rw",
        db.photoQueue,
        db.venues,
        db.visitLogs,
        async () => {
          const current = await db.visitLogs.get(photo.visitLogId);
          const venue = await db.venues.get(photo.spotId);
          if (!current || !venue) return;
          const now = Math.max(
            Date.now(),
            current.updatedAt + 1,
            venue.updatedAt + 1,
          );
          await db.visitLogs.update(current.id, {
            photoUrls: [...new Set([...current.photoUrls, url])],
            updatedAt: now,
            syncStatus: "pending",
          });
          if (venue.localCoverPhotoId === photo.id)
            await db.venues.update(venue.id, {
              coverPhotoUrl: url,
              updatedAt: now,
              syncStatus: "pending",
            });
          await db.photoQueue.update(photo.id, {
            status: "uploaded",
            thumbnail,
            remoteUrl: url,
            blob: undefined,
            error: undefined,
          });
        },
      );
    } catch (error) {
      if (signal.aborted) return;
      const message = error instanceof Error ? error.message : "Upload failed";
      await db.photoQueue.update(photo.id, { error: message });
      throw error;
    }
  }
}
let running: Promise<void> | null = null;
let pendingResyncUid: string | null = null;
export function syncJournal(uid: string, signal: AbortSignal): Promise<void> {
  if (running) {
    pendingResyncUid = uid;
    return running;
  }
  running = (async () => {
    if (signal.aborted || !navigator.onLine) return;
    // Claim any unowned local records for the current user
    await associateLocalRecordsWithUser(uid);
    // Preserve legacy cloud-only records on the first normalized sync.
    await importLegacyCloud(uid);
    let photoError: unknown;
    try {
      await uploadPhotos(uid, signal);
    } catch (e) {
      photoError = e;
    }
    for (const kind of kinds) {
      if (signal.aborted || !navigator.onLine) return;
      const pending = await table(kind)
        .filter(
          (r) =>
            (!r.userId || r.userId === uid) &&
            r.syncStatus !== "synced" &&
            r.syncStatus !== "error",
        )
        .toArray();
      for (const record of pending) {
        if (signal.aborted) return;
        try {
          await push(kind, record, uid);
        } catch (recordError) {
          console.warn(
            `[Sync] Failed to push ${kind} record ${record.id}:`,
            recordError,
          );
          const errMsg =
            recordError instanceof Error
              ? recordError.message
              : String(recordError);
          if (
            errMsg.includes("permission-denied") ||
            errMsg.includes("invalid") ||
            errMsg.includes("not-found")
          ) {
            await table(kind).update(record.id, { syncStatus: "error" });
          }
        }
      }
    }
    if (photoError) throw photoError;
  })().finally(async () => {
    running = null;
    const nextUid = pendingResyncUid;
    pendingResyncUid = null;
    if (nextUid && typeof navigator !== "undefined" && navigator.onLine) {
      void syncJournal(nextUid, new AbortController().signal).catch((err) => {
        console.warn("[Sync] Background resync error:", err);
      });
    }
  });
  return running;
}
export async function subscribeJournal(
  uid: string,
  signal: AbortSignal,
  onError: (message: string) => void,
): Promise<() => void> {
  const unsubscribes: Unsubscribe[] = [];
  const stop = () => unsubscribes.forEach((fn) => fn());
  signal.addEventListener("abort", stop, { once: true });
  for (const kind of kinds) {
    const checkpoint = await db.syncState.get(`${uid}-${kind}`);
    if (signal.aborted) break;
    const q = query(
      collection(getFirebaseFirestore(), "users", uid, kind),
      where("updatedAt", ">=", checkpoint?.updatedAt ?? 0),
    );
    let chain = Promise.resolve();
    unsubscribes.push(
      onSnapshot(
        q,
        { includeMetadataChanges: true },
        (snapshot) => {
          const records = snapshot
            .docChanges()
            .filter((c) => c.type !== "removed")
            .map(
              (c) =>
                ({ ...c.doc.data(), id: c.doc.id, userId: uid }) as RecordData,
            );
          chain = chain
            .then(async () => {
              if (signal.aborted) return;
              await mergeJournalRecords(kind, records, uid);
              if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites && records.length) {
                const latest = Math.max(...records.map((r) => r.updatedAt));
                const old = await db.syncState.get(`${uid}-${kind}`);
                await db.syncState.put({
                  id: `${uid}-${kind}`,
                  updatedAt: Math.max(latest, old?.updatedAt ?? 0),
                });
              }
            })
            .catch((e) =>
              onError(
                e instanceof Error ? e.message : "Cloud sync unavailable",
              ),
            );
        },
        (e) => onError(e.message),
      ),
    );
  }
  return () => {
    signal.removeEventListener("abort", stop);
    stop();
  };
}
export function pendingCount(records: SyncRecord[]) {
  return records.filter((r) => r.syncStatus !== "synced").length;
}
