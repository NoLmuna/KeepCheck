import type { FoodSpotLog, SpotImage } from "@/app/db";
import type { Spot, VisitLog, QueuedPhoto } from "./models";
import { haversine, spotLocation } from "./geo";
export function migrateLegacyRecords(
  records: FoodSpotLog[],
  images: SpotImage[],
) {
  const spots: Spot[] = [],
    visits: VisitLog[] = [],
    photos: QueuedPhoto[] = [];
  // Stable ordering makes independently migrated devices choose the same canonical venue.
  const ordered = [...records].sort((a, b) =>
    String(a.firebaseId ?? a.id).localeCompare(String(b.firebaseId ?? b.id)),
  );
  for (const old of ordered) {
    const base = `legacy-${old.userId || "guest"}-${old.firebaseId || old.id}`;
    const location = spotLocation(old);
    let spot = spots.find(
      (s) =>
        !s.isDeleted &&
        !old.isDeleted &&
        s.userId === old.userId &&
        location &&
        !s.locationMissing &&
        ((location.osmId && location.osmId === s.location.osmId) ||
          (s.name.toLowerCase() === old.name.toLowerCase() &&
            haversine(location, s.location) < 50)),
    );
    const timestamp = old.updatedAt ?? old.createdAt;
    if (!spot) {
      spot = {
        id: base,
        ...(old.userId ? { userId: old.userId } : {}),
        name: old.name,
        category:
          old.venueCategory ??
          (old.category === "Cafe" ? "coffee" : "restaurant"),
        status: "visited",
        vibeTags: [],
        menuItems: [],
        collectionIds: [],
        location: location ?? {
          lat: 0,
          lng: 0,
          formattedAddress: "Location not recorded",
        },
        locationMissing: !location,
        createdAt: old.createdAt,
        updatedAt: timestamp,
        syncStatus: "pending",
        isDeleted: old.isDeleted ?? false,
      };
      spots.push(spot);
    }
    const visit: VisitLog = {
      id: `visit-${base}`,
      spotId: spot.id,
      ...(old.userId ? { userId: old.userId } : {}),
      visitedAt: old.createdAt,
      rating: Math.max(1, Math.min(5, old.rating / 2)),
      itemsOrdered: [],
      notes: old.comment,
      photoUrls: [],
      localPhotoIds: [],
      createdAt: old.createdAt,
      updatedAt: timestamp,
      syncStatus: "pending",
      isDeleted: old.isDeleted ?? false,
    };
    for (const img of images.filter((i) => i.spotId === old.id)) {
      const id = `photo-${base}-${img.firebaseId && img.firebaseId !== "uploaded" ? img.firebaseId : img.id}`;
      photos.push({
        id,
        spotId: spot.id,
        visitLogId: visit.id,
        ...(old.userId ? { userId: old.userId } : {}),
        blob: img.blob,
        status: "pending",
        createdAt: img.createdAt,
      });
      visit.localPhotoIds.push(id);
      spot.localCoverPhotoId ??= id;
    }
    // Preserve a thumbnail even when no original photo remains on this device.
    if (!visit.localPhotoIds.length && old.thumbnail)
      spot.coverPhotoUrl ??= old.thumbnail;
    visits.push(visit);
  }
  for (const spot of spots) {
    const own = visits.filter((v) => v.spotId === spot.id && !v.isDeleted);
    spot.overallRating = own.length
      ? own.reduce((sum, v) => sum + v.rating, 0) / own.length
      : undefined;
  }
  return { spots, visits, photos };
}
