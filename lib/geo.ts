import type { FoodSpotLog, SpotLocation } from "@/app/db";

export interface Coordinates {
  lat: number;
  lng: number;
}
export interface Venue {
  key: string;
  name: string;
  category: NonNullable<FoodSpotLog["venueCategory"]>;
  cuisine?: string;
  location: SpotLocation;
  spot?: FoodSpotLog;
  record?: import("./models").Spot;
  openingHours?: string;
}
export function coordinateLabel(p: Coordinates): string {
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
}

export function isCoordinateString(str?: string): boolean {
  if (!str) return false;
  return /^-?\d+(\.\d+)?[,\s]+-?\d+(\.\d+)?$/.test(str.trim());
}

export function humanReadableLocation(
  loc?: SpotLocation,
  locationMissing?: boolean,
): string {
  if (locationMissing) return "Location not set";
  if (!loc) return "Location not set";
  if (loc.locality && !isCoordinateString(loc.locality)) return loc.locality;
  if (loc.formattedAddress && !isCoordinateString(loc.formattedAddress)) {
    return loc.formattedAddress;
  }
  return "Pin on map";
}
export function spotLocation(spot: FoodSpotLog): SpotLocation | undefined {
  const lat = spot.location?.lat ?? spot.latitude;
  const lng = spot.location?.lng ?? spot.longitude;
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat === undefined ||
    lng === undefined
  )
    return;
  return {
    ...spot.location,
    lat,
    lng,
    formattedAddress:
      spot.location?.formattedAddress || coordinateLabel({ lat, lng }),
  };
}
export function savedVenue(spot: FoodSpotLog): Venue | undefined {
  const location = spotLocation(spot);
  if (!location || spot.isDeleted) return;
  return {
    key: `saved-${spot.id}`,
    name: spot.name,
    location,
    spot,
    category:
      spot.venueCategory ??
      (spot.category === "Cafe" ? "coffee" : "restaurant"),
  };
}
export function haversine(a: Coordinates, b: Coordinates): number {
  const radians = (n: number) => (n * Math.PI) / 180;
  const x =
    Math.sin(radians(b.lat - a.lat) / 2) ** 2 +
    Math.cos(radians(a.lat)) *
      Math.cos(radians(b.lat)) *
      Math.sin(radians(b.lng - a.lng) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, x)));
}
export function formatDistance(metres: number): string {
  return metres < 1000
    ? `${Math.round(metres)} m`
    : `${(metres / 1000).toFixed(1)} km`;
}
export function categoryFor(value?: string): Venue["category"] {
  if (
    value === "cafe" ||
    value === "coffee_shop" ||
    value === "coffee" ||
    value === "tea"
  )
    return "coffee";
  if (value === "bakery" || value === "pastry") return "bakery";
  if (value === "bar" || value === "pub") return "bar";
  if (
    value === "restaurant" ||
    value === "fast_food" ||
    value === "ice_cream" ||
    value === "food_court"
  )
    return "restaurant";
  return "other";
}
import type { Spot } from "./models";
export function journalVenue(spot: Spot): Venue {
  const loc: SpotLocation = spot.location && Number.isFinite(spot.location.lat) && Number.isFinite(spot.location.lng)
    ? spot.location
    : {
        lat: 0,
        lng: 0,
        formattedAddress: "Location not recorded",
      };
  return {
    key: `venue-${spot.id}`,
    name: spot.name || "Unnamed Spot",
    category: spot.category || "other",
    location: loc,
    record: spot,
  };
}
