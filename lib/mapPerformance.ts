import { haversine, type Coordinates, type Venue } from "./geo";
export function nearestPois(
  venues: Venue[],
  center: Coordinates,
  savedIds: ReadonlySet<string>,
  limit = 40,
): Venue[] {
  const seen = new Set<string>();
  return venues
    .filter((v) => {
      const id = v.location.osmId ?? v.key;
      if (savedIds.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((venue) => ({ venue, distance: haversine(center, venue.location) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map((v) => v.venue);
}
export function shouldCommitPosition(
  previous: Coordinates | null,
  next: Coordinates,
  elapsed: number,
): boolean {
  return !previous || elapsed >= 2000 || haversine(previous, next) >= 15;
}

export function discoveryBounds(
  bounds: { south: number; west: number; north: number; east: number },
  center: Coordinates,
) {
  const latRadius = 2000 / 111195;
  const lngRadius =
    latRadius / Math.max(0.1, Math.cos((center.lat * Math.PI) / 180));
  return {
    south: Math.max(bounds.south, center.lat - latRadius),
    north: Math.min(bounds.north, center.lat + latRadius),
    west: Math.max(bounds.west, center.lng - lngRadius),
    east: Math.min(bounds.east, center.lng + lngRadius),
  };
}
