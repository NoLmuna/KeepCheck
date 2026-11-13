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
import { db, type FoodSpotLog } from "@/app/db";
import { getFirebaseApp, getFirebaseFirestore } from "./firebase";
import type { Spot, VisitLog, SpotCollection, SyncRecord } from "./models";
import { migrateLegacyRecords } from "./legacyMigration";

type Kind = "venues" | "visitLogs" | "collections";
type RecordData = Spot | VisitLog | SpotCollection;
const kinds: Kind[] = ["venues", "visitLogs", "collections"];
function table(kind: Kind) {
  return db.table<RecordData, string>(kind);
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
      if (!old || old.updatedAt < record.updatedAt)
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
    (d) => ({ ...d.data(), firebaseId: d.id, userId: uid }) as FoodSpotLog,
  );
  const converted = migrateLegacyRecords(records, []);
  await db.transaction(
    "rw",
    db.venues,
    db.visitLogs,
    db.syncState,
    async () => {
      for (const spot of converted.spots)
        if (!(await db.venues.get(spot.id))) await db.venues.add(spot);
      for (const visit of converted.visits)
        if (!(await db.visitLogs.get(visit.id))) await db.visitLogs.add(visit);
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
  if (winner) await mergeJournalRecords(kind, [winner], uid);
  else
    await db.transaction("rw", table(kind), async () => {
      const current = await table(kind).get(record.id);
      if (current?.updatedAt === record.updatedAt)
        await table(kind).put({ ...current, syncStatus: "synced" });
    });
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
  storage.maxUploadRetryTime = 30000;
  storage.maxOperationRetryTime = 15000;
  for (const photo of queued) {
    if (signal.aborted || !navigator.onLine) return;
    const parent = await db.visitLogs.get(photo.visitLogId);
    const spot = await db.venues.get(photo.spotId);
    if (!parent || !spot || parent.isDeleted || spot.isDeleted) continue;
    if (!photo.blob) continue;
    try {
      const reference = ref(storage, `users/${uid}/journal/${photo.id}`);
      const task = uploadBytesResumable(reference, photo.blob, {
        contentType: photo.blob.type,
      });
      const cancel = () => task.cancel();
      signal.addEventListener("abort", cancel, { once: true });
      const timeout = setTimeout(cancel, 45000);
      try {
        await task;
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener("abort", cancel);
      }
      if (signal.aborted) return;
      const url = await getDownloadURL(reference);
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
export function syncJournal(uid: string, signal: AbortSignal): Promise<void> {
  if (running) return running;
  running = (async () => {
    if (signal.aborted || !navigator.onLine) return;
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
        .where("userId")
        .equals(uid)
        .filter((r) => r.syncStatus !== "synced")
        .toArray();
      for (const record of pending) {
        if (signal.aborted) return;
        await push(kind, record, uid);
      }
    }
    if (photoError) throw photoError;
  })().finally(() => {
    running = null;
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
              if (!snapshot.metadata.fromCache && records.length) {
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
