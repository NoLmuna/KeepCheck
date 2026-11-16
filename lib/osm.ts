import type { LineString } from "geojson";
import type { SpotLocation } from "@/app/db";
import { db } from "@/app/db";
import type { Spot } from "./models";
import {
  categoryFor,
  coordinateLabel,
  haversine,
  isCoordinateString,
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
  name?: string;
  osm_type?: string;
  osm_id?: number;
  address?: {
    road?: string;
    pedestrian?: string;
    footway?: string;
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    country?: string;
  };
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
  signal?: AbortSignal,
  init?: RequestInit,
): Promise<T | null> {
  if (signal?.aborted || (typeof navigator !== "undefined" && !navigator.onLine))
    return null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal) signal.addEventListener("abort", abort, { once: true });
  const timeoutMs = url.includes("overpass") ? 4500 : 7000;
  const timeout = setTimeout(abort, timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        "User-Agent": "KeepCheck/1.0 (https://keep-check.vercel.app)",
        Accept: "application/json, */*",
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
      referrerPolicy: "strict-origin-when-cross-origin",
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener("abort", abort);
  }
}
const osmId = (type: string, id: number) =>
  `${({ N: "node", W: "way", R: "relation" } as Record<string, string>)[type] ?? type}/${id}`;
export async function searchVenues(
  query: string,
  position: Coordinates | null,
  signal?: AbortSignal,
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

interface CachedBoundsEntry {
  bounds: Bounds;
  expires: number;
  venues: Venue[];
}
const viewportCache = new Map<string, CachedBoundsEntry>();

async function queryOverpass(
  query: string,
  signal?: AbortSignal,
): Promise<OverpassResponse | null> {
  if (signal?.aborted || (typeof navigator !== "undefined" && !navigator.onLine)) {
    return null;
  }
  const primaryUrl = "https://overpass-api.de/api/interpreter";
  const fallbackUrl = "https://maps.mail.ru/osm/tools/overpass/api/interpreter";

  const fetchEndpoint = async (url: string) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal) signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 6000);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "User-Agent": "KeepCheck/1.0 (https://keep-check.vercel.app)",
          Accept: "application/json, */*",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ data: query }),
        signal: controller.signal,
        referrerPolicy: "strict-origin-when-cross-origin",
      });
      if (response.ok) {
        return { data: (await response.json()) as OverpassResponse };
      }
      return { status: response.status, failed: true };
    } catch {
      return { error: true };
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", abort);
    }
  };

  const first = await fetchEndpoint(primaryUrl);
  if (first.data && Array.isArray(first.data.elements)) {
    return first.data;
  }

  // Only attempt fallback mirror if real network error occurred or status is 429/5xx (real HTTP)
  const shouldFallback =
    first.error ||
    (typeof first.status === "number" && (first.status === 429 || first.status >= 500));
  if (
    shouldFallback &&
    !signal?.aborted &&
    (typeof navigator === "undefined" || navigator.onLine)
  ) {
    const second = await fetchEndpoint(fallbackUrl);
    if (second.data && Array.isArray(second.data.elements)) {
      return second.data;
    }
  }

  return null;
}

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
  if (cached && (cached.expires > Date.now() || !navigator.onLine)) {
    return cached.venues;
  }

  // Check if viewport is contained in an existing cached bounding box
  for (const entry of viewportCache.values()) {
    if (
      entry.expires > Date.now() &&
      b.south >= entry.bounds.south &&
      b.north <= entry.bounds.north &&
      b.west >= entry.bounds.west &&
      b.east <= entry.bounds.east
    ) {
      return entry.venues;
    }
  }

  const query = `[out:json][timeout:6];(nwr[amenity~"^(cafe|restaurant|fast_food|bar|pub|ice_cream|food_court)$"](${box});nwr[shop~"^(bakery|coffee|tea|pastry)$"](${box}););out center tags;`;
  const data = await queryOverpass(query, signal);
  if (!Array.isArray(data?.elements)) return null;

  const venues = new Map<string, Venue>();
  for (const e of data.elements) {
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    if (
      lat === undefined ||
      lng === undefined ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    )
      continue;
    const t = e.tags ?? {};
    const id = osmId(e.type, e.id);
    const locality = t["addr:city"] || t["addr:suburb"];
    const address = [t["addr:housenumber"], t["addr:street"], locality]
      .filter(Boolean)
      .join(" ");
    const category =
      categoryFor(t.amenity) !== "other"
        ? categoryFor(t.amenity)
        : categoryFor(t.shop);
    const venueName =
      t.name ||
      t.brand ||
      t["brand:en"] ||
      t.operator ||
      "Unnamed venue";

    venues.set(id, {
      key: id,
      name: venueName,
      category,
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

  const venueList = [...venues.values()];
  if (!signal.aborted) {
    if (viewportCache.size >= 40) {
      viewportCache.delete(viewportCache.keys().next().value!);
    }
    viewportCache.set(box, {
      bounds: b,
      expires: Date.now() + 300000,
      venues: venueList,
    });
  }
  return venueList;
}

export interface ClickLocationDetails {
  snappedVenue?: Venue;
  title: string;
  subtitle: string;
  category: Venue["category"];
  location: SpotLocation;
  nearbyStores: Venue[];
}

export async function lookupClickLocation(
  p: Coordinates,
  cachedPois: Venue[],
  signal: AbortSignal,
): Promise<ClickLocationDetails> {
  // 1. Synchronously check if any cached POI is within 40m
  const nearbyCached = cachedPois
    .map((v) => ({ venue: v, dist: haversine(p, v.location) }))
    .filter((item) => item.dist <= 75)
    .sort((a, b) => a.dist - b.dist);

  const closestCached = nearbyCached[0];
  if (closestCached && closestCached.dist <= 40) {
    const v = closestCached.venue;
    const street = v.location.formattedAddress;
    const locality = v.location.locality;
    const subtitle =
      street && locality && !street.includes(locality)
        ? `${street}, ${locality}`
        : street || locality || "Near your pin";
    return {
      snappedVenue: v,
      title: v.name,
      subtitle,
      category: v.category,
      location: v.location,
      nearbyStores: nearbyCached.slice(1, 4).map((item) => item.venue),
    };
  }

  // 2. Fast 2500ms Photon reverse + Overpass around:50 + Nominatim
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal) signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 2500);

  let photonName: string | undefined;
  let photonStreet: string | undefined;
  let photonLocality: string | undefined;
  let photonCategory: Venue["category"] = "other";
  let photonId: string | undefined;
  let photonCoords: Coordinates | undefined;

  let nominatimStreet: string | undefined;
  let nominatimNeighbourhood: string | undefined;
  let nominatimLocality: string | undefined;
  let nominatimDisplay: string | undefined;

  const liveStores: Venue[] = [];

  try {
    const [photonRes, nominatimRes, overpassRes] = await Promise.allSettled([
      request<PhotonResponse>(
        `https://photon.komoot.io/reverse?lat=${p.lat}&lon=${p.lng}`,
        controller.signal,
      ),
      request<NominatimResponse>(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${p.lat}&lon=${p.lng}`,
        controller.signal,
      ),
      (async () => {
        const query = `[out:json][timeout:2];(nwr(around:50,${p.lat},${p.lng})[amenity~"^(cafe|restaurant|fast_food|bar|pub|ice_cream|food_court)$"];nwr(around:50,${p.lat},${p.lng})[shop~"^(bakery|coffee|tea|pastry)$"];);out center tags 5;`;
        return queryOverpass(query, controller.signal);
      })(),
    ]);

    if (photonRes.status === "fulfilled" && photonRes.value?.features?.[0]) {
      const feat = photonRes.value.features[0];
      const props = feat.properties;
      const [lng, lat] = feat.geometry?.coordinates ?? [];
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        photonCoords = { lat, lng };
      }
      photonName = props.name;
      photonStreet = props.street;
      photonLocality = props.city || props.town || props.village;
      photonCategory = categoryFor(props.osm_value);
      if (props.osm_type && props.osm_id) {
        photonId = osmId(props.osm_type, props.osm_id);
      }
    }

    if (nominatimRes.status === "fulfilled" && nominatimRes.value) {
      const nom = nominatimRes.value;
      nominatimDisplay = nom.display_name;
      const addr = nom.address;
      if (addr) {
        nominatimStreet = addr.road || addr.pedestrian || addr.footway;
        nominatimNeighbourhood = addr.suburb || addr.neighbourhood;
        nominatimLocality = addr.city || addr.town || addr.village;
      }
    }

    if (overpassRes.status === "fulfilled" && Array.isArray(overpassRes.value?.elements)) {
      for (const e of overpassRes.value.elements) {
        const lat = e.lat ?? e.center?.lat;
        const lng = e.lon ?? e.center?.lon;
        if (
          !Number.isFinite(lat) ||
          !Number.isFinite(lng) ||
          lat === undefined ||
          lng === undefined
        )
          continue;
        const t = e.tags ?? {};
        const id = osmId(e.type, e.id);
        const name = t.name || t.brand || t["brand:en"] || t.operator;
        if (!name) continue;
        const cat =
          categoryFor(t.amenity) !== "other"
            ? categoryFor(t.amenity)
            : categoryFor(t.shop);
        const loc = t["addr:city"] || t["addr:suburb"];
        const addr = [t["addr:housenumber"], t["addr:street"], loc]
          .filter(Boolean)
          .join(" ");
        liveStores.push({
          key: id,
          name,
          category: cat,
          cuisine: t.cuisine,
          location: {
            lat,
            lng,
            osmId: id,
            ...(loc ? { locality: loc } : {}),
            formattedAddress: addr || coordinateLabel({ lat, lng }),
          },
        });
      }
    }
  } catch {
    // Ignore timeout/network errors
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", abort);
  }

  // Combine live stores with cached stores within 75m
  const allCandidateStores = [
    ...liveStores,
    ...nearbyCached.map((item) => item.venue),
  ];
  const uniqueCandidateStores: Venue[] = [];
  const seenIds = new Set<string>();
  for (const s of allCandidateStores) {
    if (!seenIds.has(s.key)) {
      seenIds.add(s.key);
      uniqueCandidateStores.push(s);
    }
  }
  const candidateStoresWithDist = uniqueCandidateStores
    .map((s) => ({ venue: s, dist: haversine(p, s.location) }))
    .filter((s) => s.dist <= 75)
    .sort((a, b) => a.dist - b.dist);

  // Check if any candidate store is within 40m
  const closestStore = candidateStoresWithDist[0];
  if (closestStore && closestStore.dist <= 40) {
    const v = closestStore.venue;
    const street = v.location.formattedAddress;
    const locality = v.location.locality || nominatimLocality || photonLocality;
    const subtitle =
      street && locality && !street.includes(locality)
        ? `${street}, ${locality}`
        : street || locality || "Near your pin";
    return {
      snappedVenue: v,
      title: v.name,
      subtitle,
      category: v.category,
      location: v.location,
      nearbyStores: candidateStoresWithDist.slice(1, 4).map((s) => s.venue),
    };
  }

  // Check if Photon returned a named business within 40m with a food/drink category
  if (
    photonName &&
    photonCategory !== "other" &&
    photonCoords &&
    haversine(p, photonCoords) <= 40
  ) {
    const v: Venue = {
      key: photonId || `photon-${photonCoords.lat}-${photonCoords.lng}`,
      name: photonName,
      category: photonCategory,
      location: {
        lat: photonCoords.lat,
        lng: photonCoords.lng,
        osmId: photonId,
        locality: photonLocality,
        formattedAddress:
          [photonStreet, photonLocality].filter(Boolean).join(", ") ||
          coordinateLabel(photonCoords),
      },
    };
    return {
      snappedVenue: v,
      title: photonName,
      subtitle:
        [photonStreet, photonLocality].filter(Boolean).join(", ") ||
        "Near your pin",
      category: photonCategory,
      location: v.location,
      nearbyStores: candidateStoresWithDist.slice(0, 3).map((s) => s.venue),
    };
  }

  // Fallback: No business found within 40m.
  // Format title as "Pin on [Street]", subtitle as "[City]", NEVER repeating city name twice!
  const street = nominatimStreet || photonStreet;
  const neighbourhood = nominatimNeighbourhood;
  const locality = nominatimLocality || photonLocality;

  let title = "Dropped pin";
  let subtitle = locality || coordinateLabel(p);

  if (street) {
    title = `Pin on ${street}`;
    if (
      neighbourhood &&
      neighbourhood.toLowerCase() !== locality?.toLowerCase()
    ) {
      subtitle = locality ? `${neighbourhood}, ${locality}` : neighbourhood;
    } else {
      subtitle = locality || coordinateLabel(p);
    }
  } else if (
    neighbourhood &&
    neighbourhood.toLowerCase() !== locality?.toLowerCase()
  ) {
    title = `Pin in ${neighbourhood}`;
    subtitle = locality || coordinateLabel(p);
  } else if (locality) {
    title = "Selected location";
    subtitle = locality;
  }

  return {
    title,
    subtitle,
    category: "other",
    location: {
      lat: p.lat,
      lng: p.lng,
      locality,
      formattedAddress:
        nominatimDisplay ||
        (street ? `${street}, ${locality || ""}` : coordinateLabel(p)),
    },
    nearbyStores: candidateStoresWithDist.slice(0, 3).map((s) => s.venue),
  };
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

export async function autoResolveLegacySpotLocations(spots: Spot[]): Promise<void> {
  if (typeof window === "undefined" || !navigator.onLine) return;
  const needsResolution = spots.filter(
    (s) =>
      !s.isDeleted &&
      !s.locationMissing &&
      s.location &&
      Number.isFinite(s.location.lat) &&
      Number.isFinite(s.location.lng) &&
      (!s.location.locality || isCoordinateString(s.location.formattedAddress))
  );

  for (const spot of needsResolution.slice(0, 3)) {
    try {
      const controller = new AbortController();
      const resolved = await reverseLocation(spot.location, controller.signal);
      if (resolved.formattedAddress && !isCoordinateString(resolved.formattedAddress)) {
        await db.venues.update(spot.id, {
          location: {
            ...spot.location,
            formattedAddress: resolved.formattedAddress,
            locality: resolved.locality || spot.location.locality,
          },
          updatedAt: Date.now(),
          syncStatus: "pending",
        });
      }
    } catch {
      // Ignore background resolution error
    }
  }
}

