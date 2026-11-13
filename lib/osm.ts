import type { LineString } from "geojson";
import type { SpotLocation } from "@/app/db";
import {
  categoryFor,
  coordinateLabel,
  type Coordinates,
  type Venue,
} from "./geo";

interface PhotonProperties {
  name?: string;
  osm_type?: string;
  osm_id?: number;
  osm_value?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  country?: string;
}
export interface PhotonResponse {
  features: {
    geometry: { coordinates: [number, number] };
    properties: PhotonProperties;
  }[];
}
export interface NominatimResponse {
  display_name?: string;
  osm_type?: string;
  osm_id?: number;
  address?: { city?: string; town?: string; village?: string; suburb?: string };
}
export interface OverpassResponse {
  elements: {
    type: string;
    id: number;
    lat?: number;
    lon?: number;
    center?: { lat: number; lon: number };
    tags?: Record<string, string>;
  }[];
}
export interface Route {
  geometry: LineString;
  distance: number;
  duration: number;
}
export interface OSRMResponse {
  code: string;
  routes?: Route[];
}
export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

// Callers handle null as a normal offline/rate-limit/timeout result.
async function request<T>(
  url: string,
  signal: AbortSignal,
  init?: RequestInit,
): Promise<T | null> {
  if (signal.aborted || (typeof navigator !== "undefined" && !navigator.onLine))
    return null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 12000);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      referrerPolicy: "strict-origin-when-cross-origin",
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}
const osmId = (type: string, id: number) =>
  `${({ N: "node", W: "way", R: "relation" } as Record<string, string>)[type] ?? type}/${id}`;
export async function searchVenues(
  query: string,
  position: Coordinates | null,
  signal: AbortSignal,
): Promise<Venue[] | null> {
  const params = new URLSearchParams({ q: query, limit: "6" });
  if (position) {
    params.set("lat", String(position.lat));
    params.set("lon", String(position.lng));
  }
  const data = await request<PhotonResponse>(
    `https://photon.komoot.io/api/?${params}`,
    signal,
  );
  if (!Array.isArray(data?.features)) return null;
  return data.features.flatMap((f) => {
    const [lng, lat] = f.geometry?.coordinates ?? [];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    const p = f.properties;
    const id =
      p.osm_type && p.osm_id
        ? osmId(p.osm_type, p.osm_id)
        : `photon-${lat}-${lng}`;
    const locality = p.city || p.town || p.village;
    const address = [
      [p.housenumber, p.street].filter(Boolean).join(" "),
      locality,
      p.state,
      p.country,
    ]
      .filter(Boolean)
      .join(", ");
    return [
      {
        key: id,
        name: p.name || p.street || "Selected place",
        category: categoryFor(p.osm_value),
        location: {
          lat,
          lng,
          osmId: id,
          ...(locality ? { locality } : {}),
          formattedAddress: address || coordinateLabel({ lat, lng }),
        },
      },
    ];
  });
}

let nextReverseAt = 0;
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}
export async function reverseLocation(
  p: Coordinates,
  signal: AbortSignal,
): Promise<SpotLocation> {
  const fallback = { ...p, formattedAddress: coordinateLabel(p) };
  if (signal.aborted || !navigator.onLine) return fallback;
  const slot = Math.max(Date.now(), nextReverseAt);
  nextReverseAt = slot + 1100;
  await delay(Math.max(0, slot - Date.now()), signal);
  const data = await request<NominatimResponse>(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${p.lat}&lon=${p.lng}`,
    signal,
  );
  const locality =
    data?.address?.city ||
    data?.address?.town ||
    data?.address?.village ||
    data?.address?.suburb;
  return {
    ...fallback,
    formattedAddress: data?.display_name || fallback.formattedAddress,
    ...(locality ? { locality } : {}),
    ...(data?.osm_type && data.osm_id
      ? { osmId: osmId(data.osm_type, data.osm_id) }
      : {}),
  };
}

const viewportCache = new Map<string, { expires: number; venues: Venue[] }>();
export async function discoverVenues(
  b: Bounds,
  signal: AbortSignal,
): Promise<Venue[] | null> {
  // Quantized outward bounds give adjacent small pans the same cache entry.
  const box = [
    Math.floor(b.south * 1000) / 1000,
    Math.floor(b.west * 1000) / 1000,
    Math.ceil(b.north * 1000) / 1000,
    Math.ceil(b.east * 1000) / 1000,
  ].join(",");
  const cached = viewportCache.get(box);
  if (cached && (cached.expires > Date.now() || !navigator.onLine))
    return cached.venues;
  const query = `[out:json][timeout:10];(nwr[amenity~"^(cafe|restaurant|bakery|fast_food)$"](${box});nwr[shop=bakery](${box}););out center tags;`;
  const data = await request<OverpassResponse>(
    "https://overpass-api.de/api/interpreter",
    signal,
    { method: "POST", body: new URLSearchParams({ data: query }) },
  );
  if (!Array.isArray(data?.elements)) return null;
  const venues = new Map<string, Venue>();
  for (const e of data.elements) {
    const lat = e.lat ?? e.center?.lat,
      lng = e.lon ?? e.center?.lon;
    if (
      lat === undefined ||
      lng === undefined ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    )
      continue;
    const t = e.tags ?? {},
      id = osmId(e.type, e.id);
    const locality = t["addr:city"] || t["addr:suburb"];
    const address = [t["addr:housenumber"], t["addr:street"], locality]
      .filter(Boolean)
      .join(" ");
    venues.set(id, {
      key: id,
      name: t.name || "Unnamed venue",
      category: categoryFor(t.shop === "bakery" ? "bakery" : t.amenity),
      cuisine: t.cuisine,
      location: {
        lat,
        lng,
        osmId: id,
        ...(locality ? { locality } : {}),
        formattedAddress: address || coordinateLabel({ lat, lng }),
      },
    });
  }
  if (!signal.aborted) {
    if (viewportCache.size >= 40)
      viewportCache.delete(viewportCache.keys().next().value!);
    viewportCache.set(box, {
      expires: Date.now() + 300000,
      venues: [...venues.values()],
    });
  }
  return [...venues.values()];
}
let nextRouteAt = 0;
export async function fetchRoute(
  from: Coordinates,
  to: Coordinates,
  mode: "foot" | "driving",
  signal: AbortSignal,
): Promise<Route | null> {
  if (signal.aborted || !navigator.onLine) return null;
  const slot = Math.max(Date.now(), nextRouteAt);
  nextRouteAt = slot + 1100;
  await delay(Math.max(0, slot - Date.now()), signal);
  // The demo's driving graph cannot become pedestrian-safe by changing a path token.
  // FOSSGIS exposes the separately prepared OSRM foot graph at /routed-foot.
  const base =
    mode === "foot"
      ? "https://routing.openstreetmap.de/routed-foot"
      : "https://router.project-osrm.org";
  const data = await request<OSRMResponse>(
    `${base}/route/v1/${mode}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`,
    signal,
  );
  const route = data?.routes?.[0];
  return data?.code === "Ok" &&
    route?.geometry?.type === "LineString" &&
    route.geometry.coordinates.length > 1 &&
    Number.isFinite(route.distance) &&
    Number.isFinite(route.duration)
    ? route
    : null;
}
