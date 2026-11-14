import { db } from "@/app/db";
import {
  vibeTags,
  type Spot,
  type VisitLog,
  type SpotCollection,
  type QueuedPhoto,
} from "./models";
export interface Backup {
  format: "keepcheck";
  version: 1;
  exportedAt: number;
  spots: Spot[];
  visitLogs: VisitLog[];
  collections: SpotCollection[];
  photos: (Omit<QueuedPhoto, "blob" | "thumbnail"> & {
    data?: string;
    preview?: string;
  })[];
}
async function encode(blob: Blob | undefined) {
  if (!blob) return undefined;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${blob.type};base64,${btoa(binary)}`;
}
function decode(data: string | undefined) {
  if (!data) return undefined;
  if (!/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(data))
    throw new Error("Invalid photo data");
  const [header, body] = data.split(",");
  return new Blob([Uint8Array.from(atob(body), (c) => c.charCodeAt(0))], {
    type: header.slice(5, header.indexOf(";")),
  });
}
export async function makeBackup(uid?: string): Promise<Backup> {
  const owned = (r: { userId?: string }) => !r.userId || r.userId === uid;
  const snapshot = await db.transaction(
    "r",
    db.venues,
    db.visitLogs,
    db.collections,
    db.photoQueue,
    async () => ({
      spots: await db.venues.filter(owned).toArray(),
      visitLogs: await db.visitLogs.filter(owned).toArray(),
      collections: await db.collections.filter(owned).toArray(),
      photos: await db.photoQueue.filter(owned).toArray(),
    }),
  );
  const photos = await Promise.all(
    snapshot.photos.map(async (p) => {
      const { blob, thumbnail, ...rest } = p;
      return {
        ...rest,
        data: await encode(blob),
        preview: await encode(thumbnail),
      };
    }),
  );
  return {
    format: "keepcheck",
    version: 1,
    exportedAt: Date.now(),
    ...snapshot,
    photos,
  };
}
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("Invalid backup record");
  return v as Record<string, unknown>;
}
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const timestamp = (v: unknown): v is number =>
  finite(v) && v >= 0 && v <= 8640000000000000;
function optionalText(record: Record<string, unknown>, keys: string[]) {
  return keys.every(
    (key) => record[key] === undefined || typeof record[key] === "string",
  );
}
const imageUrl = (v: unknown) =>
  typeof v === "string" &&
  /^(https?:\/\/|data:image\/(webp|jpeg|png);base64,)/.test(v);
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
function base(v: unknown) {
  const r = object(v);
  if (
    typeof r.id !== "string" ||
    !r.id ||
    r.id.includes("/") ||
    !timestamp(r.createdAt) ||
    !timestamp(r.updatedAt) ||
    !["pending", "synced", "error"].includes(String(r.syncStatus)) ||
    (r.isDeleted !== undefined && typeof r.isDeleted !== "boolean")
  )
    throw new Error("Invalid record ID or timestamps");
  return r;
}
export function validateBackup(input: unknown): Backup {
  const b = object(input);
  if (
    b.format !== "keepcheck" ||
    b.version !== 1 ||
    !Array.isArray(b.spots) ||
    !Array.isArray(b.visitLogs) ||
    !Array.isArray(b.collections) ||
    !Array.isArray(b.photos)
  )
    throw new Error("Choose a KeepCheck JSON backup (version 1).");
  for (const value of b.spots) {
    const s = base(value),
      l = object(s.location);
    if (
      typeof s.name !== "string" ||
      !s.name.trim() ||
      !["coffee", "restaurant", "bakery", "bar", "other"].includes(
        String(s.category),
      ) ||
      !["visited", "wishlist"].includes(String(s.status)) ||
      !strings(s.vibeTags) ||
      !s.vibeTags.every((t) => (vibeTags as readonly string[]).includes(t)) ||
      !strings(s.collectionIds) ||
      !Array.isArray(s.menuItems) ||
      !finite(l.lat) ||
      Math.abs(l.lat) > 90 ||
      !finite(l.lng) ||
      Math.abs(l.lng) > 180 ||
      typeof l.formattedAddress !== "string" ||
      !optionalText(l, ["locality", "osmId"]) ||
      !optionalText(s, ["localCoverPhotoId"]) ||
      (s.coverPhotoUrl !== undefined && !imageUrl(s.coverPhotoUrl)) ||
      (s.locationMissing !== undefined &&
        typeof s.locationMissing !== "boolean") ||
      (s.overallRating !== undefined &&
        (!finite(s.overallRating) ||
          s.overallRating < 1 ||
          s.overallRating > 5)) ||
      (s.budgetTier !== undefined &&
        !["₱", "₱₱", "₱₱₱"].includes(String(s.budgetTier)))
    )
      throw new Error("Invalid venue in backup");
    for (const item of s.menuItems) {
      const m = object(item);
      if (
        typeof m.id !== "string" ||
        typeof m.name !== "string" ||
        !["must-order", "skip"].includes(String(m.verdict)) ||
        (m.price !== undefined && (!finite(m.price) || m.price < 0))
      )
        throw new Error("Invalid menu item");
    }
  }
  const spotIds = new Set(b.spots.map((s) => object(s).id)),
    visitIds = new Set(b.visitLogs.map((s) => object(s).id));
  for (const value of b.visitLogs) {
    const v = base(value);
    if (
      !spotIds.has(v.spotId) ||
      !finite(v.rating) ||
      v.rating < 1 ||
      v.rating > 5 ||
      !timestamp(v.visitedAt) ||
      !optionalText(v, ["notes"]) ||
      !strings(v.itemsOrdered) ||
      !strings(v.photoUrls) ||
      !v.photoUrls.every(imageUrl) ||
      !strings(v.localPhotoIds) ||
      (v.totalSpend !== undefined &&
        (!finite(v.totalSpend) || v.totalSpend < 0))
    )
      throw new Error("Invalid visit or missing venue");
  }
  for (const value of b.collections) {
    const c = base(value);
    if (
      typeof c.name !== "string" ||
      !c.name.trim() ||
      !optionalText(c, ["description"])
    )
      throw new Error("Invalid collection");
  }
  for (const value of b.photos) {
    const p = object(value);
    if (
      typeof p.id !== "string" ||
      !p.id ||
      p.id.includes("/") ||
      !timestamp(p.createdAt) ||
      (p.remoteUrl !== undefined && !imageUrl(p.remoteUrl)) ||
      !spotIds.has(p.spotId) ||
      !visitIds.has(p.visitLogId) ||
      !["pending", "uploaded"].includes(String(p.status)) ||
      (p.data !== undefined && typeof p.data !== "string") ||
      (p.preview !== undefined && typeof p.preview !== "string")
    )
      throw new Error("Invalid photo record");
  }
  for (const list of [b.spots, b.visitLogs, b.collections, b.photos])
    if (new Set(list.map((v) => object(v).id)).size !== list.length)
      throw new Error("Duplicate IDs in backup");
  return input as Backup;
}
export async function restoreBackup(input: unknown, uid?: string) {
  const backup = validateBackup(input);
  // Decode before opening the transaction so malformed photos cannot cause a partial import.
  const photos = backup.photos.map((p) => {
    const { data, preview, ...rest } = p;
    return { ...rest, blob: decode(data), thumbnail: decode(preview) };
  });
  let restored = 0;
  await db.transaction(
    "rw",
    db.venues,
    db.visitLogs,
    db.collections,
    db.photoQueue,
    async () => {
      async function merge<T extends Spot | VisitLog | SpotCollection>(
        name: string,
        rows: T[],
      ) {
        for (const row of rows) {
          const table = db.table<T, string>(name);
          const old = await table.get(row.id);
          if (old?.userId && old.userId !== uid)
            throw new Error(
              "A backup ID belongs to another account on this device",
            );
          if (!old || row.updatedAt > old.updatedAt) {
            await table.put({ ...row, userId: uid, syncStatus: "pending" });
            restored++;
          }
        }
      }
      await merge("venues", backup.spots);
      await merge("visitLogs", backup.visitLogs);
      await merge("collections", backup.collections);
      for (const p of photos) {
        const old = await db.photoQueue.get(p.id);
        if (old?.userId && old.userId !== uid)
          throw new Error(
            "A photo ID belongs to another account on this device",
          );
        if (!old || (!old.blob && p.blob && old.status !== "uploaded"))
          await db.photoQueue.put({
            ...p,
            userId: uid,
            status: p.blob ? "pending" : p.status,
          });
      }
    },
  );
  return restored;
}
export function backupCsv(backup: Backup) {
  const cell = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const rows: unknown[][] = [
    [
      "Type",
      "ID",
      "Venue",
      "Category",
      "Status",
      "Rating (1–5)",
      "Visited at",
      "Spend",
      "Address",
      "Vibes",
      "Notes / description",
      "Items ordered",
      "Collections",
      "Deleted",
    ],
  ];
  for (const s of backup.spots)
    rows.push([
      "venue",
      s.id,
      s.name,
      s.category,
      s.status,
      s.overallRating,
      "",
      "",
      s.location.formattedAddress,
      s.vibeTags.join("; "),
      "",
      "",
      s.collectionIds.join("; "),
      s.isDeleted ?? false,
    ]);
  for (const v of backup.visitLogs)
    rows.push([
      "visit",
      v.id,
      backup.spots.find((s) => s.id === v.spotId)?.name,
      "",
      "",
      v.rating,
      new Date(v.visitedAt).toISOString(),
      v.totalSpend,
      "",
      "",
      v.notes,
      v.itemsOrdered.join("; "),
      "",
      v.isDeleted ?? false,
    ]);
  for (const c of backup.collections)
    rows.push([
      "collection",
      c.id,
      c.name,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      c.description,
      "",
      "",
      c.isDeleted ?? false,
    ]);
  return "\ufeff" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
