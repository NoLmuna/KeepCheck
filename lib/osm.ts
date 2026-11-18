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
  suburb?: string;
  district?: string;
  state?: string;
  country?: string;
}
export interface SearchPhotonOptions {
  lat?: number;
  lon?: number;
  zoom?: number;
  bbox?: [number, number, number, number] | string;
  limit?: number;
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
export async function searchPhoton(
  query: string,
  options?: SearchPhotonOptions | Coordinates | null,
  signal?: AbortSignal,
): Promise<Venue[] | null> {
  if (!query || query.trim().length === 0) return [];
  const limit =
    options && "limit" in options && options.limit
      ? String(options.limit)
      : "10";
  const params = new URLSearchParams({ q: query.trim(), limit });
  if (options) {
    if ("lat" in options && Number.isFinite(options.lat)) {
      params.set("lat", String(options.lat));
    }
    const lon =
      "lon" in options && options.lon !== undefined
        ? options.lon
        : "lng" in options && options.lng !== undefined
          ? options.lng
          : undefined;
    if (lon !== undefined && Number.isFinite(lon)) {
      params.set("lon", String(lon));
    }
    if ("zoom" in options && Number.isFinite(options.zoom)) {
      params.set("zoom", String(Math.round(options.zoom!)));
    }
    if ("bbox" in options && options.bbox) {
      const bboxStr = Array.isArray(options.bbox)
        ? options.bbox.join(",")
        : options.bbox;
      params.set("bbox", bboxStr);
    }
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
    const locality = p.city || p.town || p.village || p.suburb || p.district;
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

export async function searchVenues(
  query: string,
  position: Coordinates | null,
  signal?: AbortSignal,
): Promise<Venue[] | null> {
  return searchPhoton(query, position, signal);
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
  timeoutMs = 6000,
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
    const timer = setTimeout(abort, timeoutMs);
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
      openingHours: t.opening_hours,
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

export function buildOverpassRegexPattern(query: string): string {
  const trimmed = query.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";

  // Strip double quotes as they delimit Overpass string literals
  const noQuotes = trimmed.replace(/"/g, "");

  // Escape regex special characters: \ ^ $ . * + ? ( ) [ ] { } | /
  let escaped = "";
  for (let i = 0; i < noQuotes.length; i++) {
    const ch = noQuotes[i];
    if (/[\\^$.*+?()[\]{}|/]/.test(ch)) {
      escaped += "\\" + ch;
    } else {
      escaped += ch;
    }
  }

  // Make apostrophes optional:
  // 1. If user typed an apostrophe (', ’, `), replace it with an optional apostrophe pattern: ['’]?
  let pattern = escaped.replace(/['’`]/g, "['’]?");

  // 2. If user typed an 's' preceded by an alphanumeric character without an apostrophe,
  //    make the apostrophe before 's' optional (e.g. "mcdonalds" -> "mcdonald['’]?s")
  pattern = pattern.replace(/([a-zA-Z0-9])s(?=[^a-zA-Z0-9]|$)/gi, "$1['’]?s");

  // If query mentions cafe/café, match both
  pattern = pattern.replace(/caf[eé]/gi, "caf[eé]");

  return pattern;
}

export async function searchLocalOverpassByName(
  query: string,
  center: { lat: number; lng: number },
  radiusMeters = 12000,
  signal?: AbortSignal,
): Promise<Venue[]> {
  try {
    if (
      !query ||
      query.trim().length === 0 ||
      !center ||
      !Number.isFinite(center.lat) ||
      !Number.isFinite(center.lng)
    ) {
      return [];
    }

    if (signal?.aborted || (typeof navigator !== "undefined" && !navigator.onLine)) {
      return [];
    }

    const pattern = buildOverpassRegexPattern(query);
    if (!pattern) return [];

    const isCoffeeQuery =
      /\b(cafe|café|coffee)\b/i.test(query) || /cafe|café|coffee/i.test(query);
    const coffeeClauses = isCoffeeQuery
      ? `node(around:${radiusMeters},${center.lat},${center.lng})[shop=coffee];way(around:${radiusMeters},${center.lat},${center.lng})[shop=coffee];node(around:${radiusMeters},${center.lat},${center.lng})[cuisine=coffee_shop];way(around:${radiusMeters},${center.lat},${center.lng})[cuisine=coffee_shop];`
      : "";

    const overpassQuery = `[out:json][timeout:10];(node(around:${radiusMeters},${center.lat},${center.lng})["name"~"${pattern}",i];way(around:${radiusMeters},${center.lat},${center.lng})["name"~"${pattern}",i];node(around:${radiusMeters},${center.lat},${center.lng})["brand"~"${pattern}",i];way(around:${radiusMeters},${center.lat},${center.lng})["brand"~"${pattern}",i];${coffeeClauses});out center tags;`;

    const data = await queryOverpass(overpassQuery, signal, 8000);
    if (!Array.isArray(data?.elements)) return [];

    const venues = new Map<string, Venue>();
    for (const e of data.elements) {
      const lat = e.lat ?? e.center?.lat;
      const lng = e.lon ?? e.center?.lon;
      if (
        lat === undefined ||
        lng === undefined ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
      ) {
        continue;
      }

      const t = e.tags ?? {};
      const id = osmId(e.type, e.id);
      const locality =
        t["addr:city"] ||
        t["addr:suburb"] ||
        t["addr:town"] ||
        t["addr:village"] ||
        t["addr:municipality"];
      const street = [t["addr:housenumber"], t["addr:street"]]
        .filter(Boolean)
        .join(" ");
      const address = [street, locality].filter(Boolean).join(", ");

      let category = categoryFor(t.amenity);
      if (category === "other") {
        category = categoryFor(t.shop);
      }
      if (category === "other" && t.cuisine && /coffee/i.test(t.cuisine)) {
        category = "coffee";
      }

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
        openingHours: t.opening_hours,
        location: {
          lat,
          lng,
          osmId: id,
          ...(locality ? { locality } : {}),
          formattedAddress: address || coordinateLabel({ lat, lng }),
        },
      });
    }

    return Array.from(venues.values());
  } catch {
    return [];
  }
}

export function normalizeVenueName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function rankAndDeduplicateSearchResults(
  savedSpots: Venue[],
  overpassVenues: Venue[],
  photonVenues: Venue[],
  center: Coordinates,
  maxProximityMeters = 40,
  localRadiusMeters = 12000,
): Venue[] {
  // 1. Prepare saved spots with computed distance
  const savedWithDist: Venue[] = savedSpots.map((v) => ({
    ...v,
    distance: haversine(center, v.location),
  }));

  // Track accepted venues for deduplication
  const accepted: Venue[] = [...savedWithDist];

  const isDuplicate = (cand: Venue, against: Venue[]): boolean => {
    const candNorm = normalizeVenueName(cand.name);
    for (const prev of against) {
      if (
        cand.location.osmId &&
        prev.location.osmId &&
        cand.location.osmId === prev.location.osmId
      ) {
        return true;
      }
      if (cand.key === prev.key) {
        return true;
      }
      const dist = haversine(prev.location, cand.location);
      if (dist < maxProximityMeters) {
        const prevNorm = normalizeVenueName(prev.name);
        if (
          candNorm === prevNorm ||
          (candNorm.length >= 3 && prevNorm.includes(candNorm)) ||
          (prevNorm.length >= 3 && candNorm.includes(prevNorm))
        ) {
          return true;
        }
      }
    }
    return false;
  };

  // 2. Process Overpass venues then Photon venues
  const nonSavedAccepted: Venue[] = [];

  for (const v of overpassVenues) {
    if (!isDuplicate(v, accepted)) {
      const dist = haversine(center, v.location);
      const withDist = { ...v, distance: dist };
      accepted.push(withDist);
      nonSavedAccepted.push(withDist);
    }
  }

  for (const v of photonVenues) {
    if (!isDuplicate(v, accepted)) {
      const dist = haversine(center, v.location);
      const withDist = { ...v, distance: dist };
      accepted.push(withDist);
      nonSavedAccepted.push(withDist);
    }
  }

  // 3. Sort non-saved results:
  // Matches within active city / 12 km radius rank strictly ahead of distant cities, ordered closest-first.
  const localNonSaved: Venue[] = [];
  const distantNonSaved: Venue[] = [];

  for (const v of nonSavedAccepted) {
    if ((v.distance ?? Infinity) <= localRadiusMeters) {
      localNonSaved.push(v);
    } else {
      distantNonSaved.push(v);
    }
  }

  localNonSaved.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  distantNonSaved.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));

  // Combine: Saved matches first, then local (<= 12km) closest-first, then distant (> 12km) closest-first.
  return [...savedWithDist, ...localNonSaved, ...distantNonSaved];
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
          openingHours: t.opening_hours,
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

/**
 * Safely parses common OpenStreetMap opening_hours format to determine
 * whether a venue is currently open or closed. Returns null if hours are
 * unspecified, unparseable, or use complex non-standard conditions.
 */
export function getOpeningHoursStatus(
  openingHours?: string,
  date = new Date(),
): "open" | "closed" | null {
  if (!openingHours || typeof openingHours !== "string") return null;

  const raw = openingHours.trim();
  if (!raw) return null;

  // Handle trivial 24/7 or closed indicators
  if (/^24\s*\/\s*7$/i.test(raw)) return "open";
  if (/^(off|closed)$/i.test(raw)) return "closed";

  try {
    const daysMap: Record<string, number> = {
      su: 0,
      mo: 1,
      tu: 2,
      we: 3,
      th: 4,
      fr: 5,
      sa: 6,
    };

    const currentDay = date.getDay(); // 0 = Sunday, 1 = Monday, ...
    const currentMinutes = date.getHours() * 60 + date.getMinutes();

    // Opening hours can be multiple rules separated by semicolon (e.g., "Mo-Fr 08:00-18:00; Sa 09:00-17:00; Su off")
    const rules = raw.split(";").map((r) => r.trim()).filter(Boolean);

    let matchedDayRule = false;
    let isOpenOnMatchedRule = false;

    for (const rule of rules) {
      const parts = rule.split(/\s+/);
      if (parts.length < 2) continue;

      const daySpec = parts[0].toLowerCase();
      const timeSpec = parts.slice(1).join(" ");

      let appliesToToday = false;

      if (daySpec === "daily" || daySpec === "mo-su" || daySpec === "su-sa") {
        appliesToToday = true;
      } else {
        const dayTokens = daySpec.split(",");
        for (const token of dayTokens) {
          if (token.includes("-")) {
            const [startD, endD] = token.split("-");
            const startIdx = daysMap[startD];
            const endIdx = daysMap[endD];
            if (startIdx !== undefined && endIdx !== undefined) {
              if (startIdx <= endIdx) {
                if (currentDay >= startIdx && currentDay <= endIdx) {
                  appliesToToday = true;
                  break;
                }
              } else {
                if (currentDay >= startIdx || currentDay <= endIdx) {
                  appliesToToday = true;
                  break;
                }
              }
            }
          } else {
            const singleIdx = daysMap[token];
            if (singleIdx === currentDay) {
              appliesToToday = true;
              break;
            }
          }
        }
      }

      if (!appliesToToday) continue;

      matchedDayRule = true;

      if (/^(off|closed)$/i.test(timeSpec)) {
        return "closed";
      }

      const intervals = timeSpec.split(",");
      for (const interval of intervals) {
        const timeMatch = interval.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
        if (timeMatch) {
          const startMin = parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);
          const endMin = parseInt(timeMatch[3], 10) * 60 + parseInt(timeMatch[4], 10);

          if (endMin <= startMin) {
            // Spans midnight (e.g. 18:00 - 02:00)
            if (currentMinutes >= startMin || currentMinutes < endMin) {
              isOpenOnMatchedRule = true;
              break;
            }
          } else {
            if (currentMinutes >= startMin && currentMinutes <= endMin) {
              isOpenOnMatchedRule = true;
              break;
            }
          }
        }
      }

      if (isOpenOnMatchedRule) return "open";
    }

    if (matchedDayRule) {
      return isOpenOnMatchedRule ? "open" : "closed";
    }

    return null;
  } catch {
    return null;
  }
}


