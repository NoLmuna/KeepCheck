import { db } from "@/app/db";
import type {
  Spot,
  VisitLog,
  SpotCollection,
  VibeTag,
  BudgetTier,
  MenuItemNote,
} from "./models";
import type { Venue, Coordinates } from "./geo";
import { haversine } from "./geo";
export interface SpotDraft {
  name: string;
  category: Spot["category"];
  status: Spot["status"];
  budgetTier?: BudgetTier;
  vibeTags: VibeTag[];
  menuItems: MenuItemNote[];
  collectionIds: string[];
}
export interface VisitDraft {
  rating: number;
  visitedAt: number;
  notes: string;
  itemsOrdered: string[];
  totalSpend?: number;
  photos: { blob: Blob; thumbnail: Blob }[];
}
export class DuplicateVenueError extends Error {
  constructor(public spot: Spot) {
    super(`You already saved ${spot.name} — log a new visit instead?`);
  }
}
export function findDuplicate(spots: Spot[], venue: Venue, uid?: string) {
  return spots.find(
    (s) =>
      !s.isDeleted &&
      (!s.userId || s.userId === uid) &&
      !s.locationMissing &&
      ((s.location.osmId && s.location.osmId === venue.location.osmId) ||
        haversine(s.location, venue.location) < 50),
  );
}
export async function saveJournalEntry(
  venue: Venue,
  draft: SpotDraft,
  visit: VisitDraft | undefined,
  uid?: string,
  duplicateId?: string,
): Promise<Spot> {
  if (!draft.name.trim()) throw new Error("A venue name is required.");
  if (
    visit &&
    (!Number.isFinite(visit.rating) ||
      visit.rating < 1 ||
      visit.rating > 5 ||
      !Number.isFinite(visit.visitedAt) ||
      (visit.totalSpend !== undefined &&
        (!Number.isFinite(visit.totalSpend) || visit.totalSpend < 0)))
  )
    throw new Error("Check the visit rating, date and spend.");
  return db.transaction(
    "rw",
    db.venues,
    db.visitLogs,
    db.photoQueue,
    async () => {
      const existingId = duplicateId ?? venue.record?.id;
      const existing = existingId ? await db.venues.get(existingId) : undefined;
      if (existing?.userId && existing.userId !== uid)
        throw new Error("This venue belongs to another account.");
      if (
        !existing &&
        venue.location.formattedAddress !== "Location not recorded"
      ) {
        const duplicate = findDuplicate(await db.venues.toArray(), venue, uid);
        if (duplicate) throw new DuplicateVenueError(duplicate);
      }
      const now = Date.now();
      const spot: Spot = {
        ...existing,
        ...(duplicateId && existing ? {} : draft),
        id: existing?.id ?? crypto.randomUUID(),
        name: duplicateId && existing ? existing.name : draft.name.trim(),
        category: existing && duplicateId ? existing.category : draft.category,
        status: visit ? "visited" : draft.status,
        vibeTags: existing && duplicateId ? existing.vibeTags : draft.vibeTags,
        menuItems:
          existing && duplicateId ? existing.menuItems : draft.menuItems,
        collectionIds:
          existing && duplicateId
            ? existing.collectionIds
            : draft.collectionIds,
        location: existing?.location ?? venue.location,
        locationMissing:
          existing?.locationMissing ??
          venue.location.formattedAddress === "Location not recorded",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        syncStatus: "pending",
        ...(existing?.userId || uid ? { userId: existing?.userId ?? uid } : {}),
      };
      if (visit) {
        const log: VisitLog = {
          id: crypto.randomUUID(),
          spotId: spot.id,
          ...(spot.userId ? { userId: spot.userId } : {}),
          visitedAt: visit.visitedAt,
          rating: visit.rating,
          itemsOrdered: visit.itemsOrdered,
          notes: visit.notes,
          ...(visit.totalSpend !== undefined
            ? { totalSpend: visit.totalSpend }
            : {}),
          photoUrls: [],
          localPhotoIds: [],
          createdAt: now,
          updatedAt: now,
          syncStatus: "pending",
        };
        for (const photo of visit.photos) {
          const id = crypto.randomUUID();
          await db.photoQueue.add({
            id,
            spotId: spot.id,
            visitLogId: log.id,
            blob: photo.blob,
            thumbnail: photo.thumbnail,
            status: "pending",
            createdAt: now,
            ...(spot.userId ? { userId: spot.userId } : {}),
          });
          log.localPhotoIds.push(id);
          spot.localCoverPhotoId ??= id;
        }
        await db.visitLogs.add(log);
        const visits = await db.visitLogs
          .where("spotId")
          .equals(spot.id)
          .filter((v) => !v.isDeleted)
          .toArray();
        spot.overallRating =
          visits.reduce((sum, v) => sum + v.rating, 0) / visits.length;
      }
      await db.venues.put(spot);
      return spot;
    },
  );
}
export async function deleteVenue(id: string) {
  await db.transaction("rw", db.venues, db.visitLogs, async () => {
    const now = Date.now();
    await db.venues.update(id, {
      isDeleted: true,
      updatedAt: now,
      syncStatus: "pending",
    });
    await db.visitLogs
      .where("spotId")
      .equals(id)
      .modify({ isDeleted: true, updatedAt: now, syncStatus: "pending" });
  });
}
export async function saveCollection(
  name: string,
  description: string,
  uid?: string,
  existing?: SpotCollection,
) {
  if (!name.trim()) throw new Error("Name is required");
  const now = Date.now();
  await db.collections.put({
    ...existing,
    id: existing?.id ?? crypto.randomUUID(),
    name: name.trim(),
    description,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    syncStatus: "pending",
    ...(existing?.userId || uid ? { userId: existing?.userId ?? uid } : {}),
  });
}
export async function deleteCollection(id: string) {
  await db.transaction("rw", db.collections, db.venues, async () => {
    const now = Date.now();
    await db.collections.update(id, {
      isDeleted: true,
      updatedAt: now,
      syncStatus: "pending",
    });
    await db.venues
      .filter((s) => s.collectionIds.includes(id))
      .modify((s) => {
        s.collectionIds = s.collectionIds.filter((c) => c !== id);
        s.updatedAt = now;
        s.syncStatus = "pending";
      });
  });
}
export interface Filters {
  status: string;
  category: string;
  vibes: VibeTag[];
  budget: string;
  distance: number;
  collection: string;
  sort: string;
  query: string;
}
export const defaultFilters: Filters = {
  status: "all",
  category: "all",
  vibes: [],
  budget: "all",
  distance: 0,
  collection: "all",
  sort: "recent",
  query: "",
};
export function filterSpots(
  spots: Spot[],
  visits: VisitLog[],
  filters: Filters,
  position: Coordinates | null,
) {
  const last = new Map<string, number>();
  for (const v of visits)
    if (!v.isDeleted)
      last.set(v.spotId, Math.max(last.get(v.spotId) ?? 0, v.visitedAt));
  return spots
    .filter(
      (s) =>
        !s.isDeleted &&
        (filters.status === "all" || s.status === filters.status) &&
        (filters.category === "all" || s.category === filters.category) &&
        filters.vibes.every((v) => s.vibeTags.includes(v)) &&
        (filters.budget === "all" || s.budgetTier === filters.budget) &&
        (filters.collection === "all" ||
          s.collectionIds.includes(filters.collection)) &&
        (!filters.distance ||
          (!!position &&
            !s.locationMissing &&
            haversine(position, s.location) <= filters.distance)) &&
        s.name.toLowerCase().includes(filters.query.toLowerCase()),
    )
    .sort((a, b) =>
      filters.sort === "rating"
        ? (b.overallRating ?? 0) - (a.overallRating ?? 0)
        : filters.sort === "nearest" && position
          ? (a.locationMissing ? Infinity : haversine(position, a.location)) -
            (b.locationMissing ? Infinity : haversine(position, b.location))
          : (last.get(b.id) ?? b.createdAt) - (last.get(a.id) ?? a.createdAt),
    );
}
export function journalInsights(spots: Spot[], visits: VisitLog[]) {
  const active = spots.filter((s) => !s.isDeleted),
    ids = new Set(active.map((s) => s.id)),
    logs = visits.filter((v) => !v.isDeleted && ids.has(v.spotId));
  const counts = (values: string[]) =>
    Object.entries(
      values.reduce<Record<string, number>>((a, v) => {
        a[v] = (a[v] ?? 0) + 1;
        return a;
      }, {}),
    ).sort((a, b) => b[1] - a[1]);
  const spend = logs.filter((v) => v.totalSpend !== undefined);
  return {
    visited: active.filter((s) => s.status === "visited").length,
    wishlist: active.filter((s) => s.status === "wishlist").length,
    visits: logs.length,
    favorite:
      counts(
        active.filter((s) => s.status === "visited").map((s) => s.category),
      )[0]?.[0] ?? "—",
    averageSpend: spend.length
      ? spend.reduce((sum, v) => sum + (v.totalSpend ?? 0), 0) / spend.length
      : null,
    localities: counts(
      active.map((s) => s.location.locality).filter((s): s is string => !!s),
    ).slice(0, 5),
  };
}
