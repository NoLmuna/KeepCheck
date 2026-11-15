"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Compass,
  Plus,
  Minus,
  Navigation,
  Star,
  Bookmark,
  Footprints,
  Car,
} from "lucide-react";
import type { Spot, SpotCollection } from "@/lib/models";
import {
  coordinateLabel,
  formatDistance,
  haversine,
  journalVenue,
  type Venue,
} from "@/lib/geo";
import {
  discoverVenues,
  fetchRoute,
  reverseLocation,
  searchVenues,
  type Route,
} from "@/lib/osm";
import type { useMapContext } from "@/lib/useMapContext";
import VenueSheet, { type SaveVenue } from "./VenueSheet";
import { nearestPois, discoveryBounds } from "@/lib/mapPerformance";
import SpotCard from "./SpotCard";
import { useToast } from "@/lib/toast";

const categorySymbols: Record<string, string> = {
  coffee: "☕",
  restaurant: "🍴",
  bakery: "🥐",
  bar: "🍷",
  other: "📍",
};

interface Props {
  navigation?: ReactNode;
  filters?: ReactNode;
  statusTabs?: ReactNode;
  syncError?: string | null;
  spots: Spot[];
  allSpots: Spot[];
  collections: SpotCollection[];
  onSave: SaveVenue;
  context: ReturnType<typeof useMapContext>;
  pending: number;
  externalSelection: Venue | null;
  onSelection: (venue: Venue | null) => void;
  /** When true, map is displayed in desktop split-screen (no internal left panel duplicate) */
  splitPaneMode?: boolean;
}

export default function SpotsMap({
  navigation,
  filters,
  statusTabs,
  syncError,
  spots,
  allSpots,
  collections,
  onSave,
  context,
  pending,
  externalSelection,
  onSelection,
  splitPaneMode = false,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const { online, position, gps, rawPosition, subscribePosition } = context;
  const { showToast } = useToast();

  const searchInput = useRef<HTMLInputElement>(null);
  const [activeResult, setActiveResult] = useState(-1);
  const [selected, setSelected] = useState<Venue | null>(externalSelection);
  const [pois, setPois] = useState<Venue[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Venue[]>([]);
  const [searchStatus, setSearchStatus] = useState("");
  const [discoveryStatus, setDiscoveryStatus] = useState("Zoom in to discover spots");

  const [routeMode, setRouteMode] = useState<"foot" | "driving">("foot");
  const [showRoute, setShowRoute] = useState(false);
  const [route, setRoute] = useState<Route | null>(null);
  const [routeStatus, setRouteStatus] = useState("");
  const reverse = useRef<AbortController | null>(null);

  const saved = useMemo(
    () =>
      spots.flatMap((s) => {
        const v = s.locationMissing ? undefined : journalVenue(s);
        return v ? [v] : [];
      }),
    [spots],
  );

  const initial = useRef(
    externalSelection?.record?.locationMissing
      ? saved[0]?.location
      : (externalSelection?.location ?? saved[0]?.location),
  );

  const flyToVenue = useCallback((venue: Venue) => {
    const map = mapRef.current;
    if (!map || venue.record?.locationMissing) return;
    map.flyTo([venue.location.lat, venue.location.lng], 17, {
      duration: 1.2,
    });
  }, []);

  useEffect(() => {
    if (externalSelection) {
      setSelected(externalSelection);
      setShowRoute(false);
      flyToVenue(externalSelection);
    } else {
      setSelected(null);
    }
  }, [externalSelection, flyToVenue]);

  const choose = useCallback(
    (venue: Venue) => {
      reverse.current?.abort();
      setSelected(venue);
      onSelection(venue);
      setShowRoute(false);
      setRoute(null);
      setRouteStatus("");
      setQuery("");
      setResults([]);
      flyToVenue(venue);
    },
    [flyToVenue, onSelection],
  );

  // Initialize Leaflet map
  useEffect(() => {
    if (!container.current) return;
    const p = initial.current;
    const map = L.map(container.current, {
      zoomControl: false,
      preferCanvas: true,
    }).setView(p ? [p.lat, p.lng] : [14.5995, 120.9842], p ? 16 : 13);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const click = (e: L.LeafletMouseEvent) => {
      reverse.current?.abort();
      const controller = new AbortController();
      reverse.current = controller;
      const location = {
        lat: e.latlng.lat,
        lng: e.latlng.lng,
        formattedAddress: coordinateLabel(e.latlng),
      };
      const venue: Venue = {
        key: `pin-${location.lat.toFixed(5)}-${location.lng.toFixed(5)}`,
        name: "Dropped pin",
        category: "other",
        location,
      };
      setSelected(venue);
      onSelection(venue);
      setShowRoute(false);
      setRoute(null);
      setRouteStatus("");

      void reverseLocation(location, controller.signal).then((resolved) => {
        if (!controller.signal.aborted) {
          const updated = { ...venue, location: resolved };
          setSelected(updated);
          onSelection(updated);
        }
      });
    };

    map.on("click", click);
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container.current);

    return () => {
      reverse.current?.abort();
      observer.disconnect();
      map.off("click", click);
      map.remove();
      mapRef.current = null;
    };
  }, [onSelection]);

  // Discover live POIs (capped at 35, zoom >= 15)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;

    const update = () => {
      clearTimeout(timer);
      controller?.abort();
      if (map.getZoom() < 15) {
        setPois([]);
        setDiscoveryStatus("Zoom in to discover spots");
        return;
      }

      timer = setTimeout(async () => {
        controller = new AbortController();
        const signal = controller.signal;
        const b = map.getBounds();
        setDiscoveryStatus(
          online ? "Finding nearby venues…" : "Offline · cached venues only",
        );

        const venues = await discoverVenues(
          discoveryBounds(
            {
              south: b.getSouth(),
              west: b.getWest(),
              north: b.getNorth(),
              east: b.getEast(),
            },
            map.getCenter(),
          ),
          signal,
        );

        if (signal.aborted) return;
        if (venues) setPois(venues.slice(0, 35));
        setDiscoveryStatus(
          venues
            ? `${Math.min(venues.length, 35)} nearby spots${online ? "" : " · cached"}`
            : "Discovery unavailable · saved spots still work",
        );
      }, 600);
    };

    map.on("moveend", update);
    update();

    return () => {
      clearTimeout(timer);
      controller?.abort();
      map.off("moveend", update);
    };
  }, [online]);

  // Autocomplete Search
  useEffect(() => {
    const controller = new AbortController();
    setResults([]);
    if (query.trim().length < 2) {
      setSearchStatus("");
      return () => controller.abort();
    }

    const local = saved.filter((v) =>
      v.name.toLowerCase().includes(query.toLowerCase()),
    );
    setResults(local);
    setSearchStatus(online ? "Searching…" : "Offline · searching saved spots");

    const timer = setTimeout(async () => {
      const found = await searchVenues(
        query.trim(),
        rawPosition.current,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const ids = new Set(local.map((v) => v.location.osmId));
      setResults([
        ...local,
        ...(found ?? []).filter((v) => !ids.has(v.location.osmId)),
      ]);
      setSearchStatus(
        found
          ? found.length || local.length
            ? ""
            : "No venues found"
          : "Live search unavailable · saved results shown",
      );
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, rawPosition, online, saved]);

  // Custom Leaflet DivIcon Markers Rendering
  const markers = useRef(new Map<string, { marker: L.Marker; venue: Venue }>());

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    const ids = new Set(
      allSpots.flatMap((s) => (s.location.osmId ? [s.location.osmId] : [])),
    );
    const venues = [...nearestPois(pois, center, ids, 35), ...saved];

    if (
      selected &&
      !selected.record?.locationMissing &&
      !venues.some((v) => v.key === selected.key)
    ) {
      venues.push(selected);
    }

    const keys = new Set(venues.map((v) => v.key));
    for (const [key, entry] of markers.current) {
      if (!keys.has(key)) {
        entry.marker.off();
        entry.marker.remove();
        markers.current.delete(key);
      }
    }

    for (const venue of venues) {
      let entry = markers.current.get(venue.key);
      const isSaved = !!venue.record;
      const isWish = venue.record?.status === "wishlist";
      const sym = categorySymbols[venue.category] ?? "📍";

      const html = isWish
        ? `<div class="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md border-2 border-white ring-2 ring-indigo-300 text-xs font-bold transition-transform hover:scale-110">🔖</div>`
        : isSaved
          ? `<div class="w-9 h-9 rounded-full bg-amber-600 text-white flex items-center justify-center shadow-md border-2 border-white ring-2 ring-amber-300 text-xs font-bold transition-transform hover:scale-110 gap-0.5"><span>${sym}</span>${
              venue.record?.overallRating
                ? `<span class="text-[10px] font-mono">${venue.record.overallRating.toFixed(1)}</span>`
                : ""
            }</div>`
          : `<div class="w-7 h-7 rounded-full bg-stone-100 text-stone-800 flex items-center justify-center shadow-xs border border-stone-300 text-xs transition-transform hover:scale-110">${sym}</div>`;

      if (!entry) {
        const marker = L.marker([venue.location.lat, venue.location.lng], {
          icon: L.divIcon({
            html,
            className: "keepcheck-marker",
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          }),
          bubblingMouseEvents: false,
          title: venue.name,
          keyboard: true,
        }).addTo(map);

        entry = { marker, venue };
        markers.current.set(venue.key, entry);
        const cur = entry;
        marker.on("click", () => choose(cur.venue));
      } else {
        entry.venue = venue;
        const old = entry.marker.getLatLng();
        if (old.lat !== venue.location.lat || old.lng !== venue.location.lng)
          entry.marker.setLatLng([venue.location.lat, venue.location.lng]);
      }

      const el = entry.marker.getElement();
      if (el) {
        el.classList.toggle("keepcheck-marker-active", venue.key === selected?.key);
        el.setAttribute(
          "aria-label",
          `${isSaved ? "Saved spot" : "Discover"}: ${venue.name}`,
        );
      }
      entry.marker.setZIndexOffset(
        venue.key === selected?.key ? 1000 : isSaved ? 500 : 0,
      );
    }
  }, [pois, saved, selected, choose, allSpots]);

  useEffect(() => {
    const entries = markers.current;
    return () => {
      entries.forEach(({ marker }) => {
        marker.off();
        marker.remove();
      });
      entries.clear();
    };
  }, []);

  // GPS User Location Pulsing Dot
  const didLocate = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const group = L.layerGroup().addTo(map);
    let dot: L.Marker | undefined, circle: L.Circle | undefined;

    const unsubscribe = subscribePosition((fix) => {
      if (!fix) {
        group.clearLayers();
        dot = undefined;
        circle = undefined;
        return;
      }
      const latlng: L.LatLngTuple = [fix.lat, fix.lng];
      if (!circle)
        circle = L.circle(latlng, {
          radius: fix.accuracy,
          weight: 1,
          color: "#2563eb",
          fillOpacity: 0.08,
          interactive: false,
        }).addTo(group);
      else circle.setLatLng(latlng).setRadius(fix.accuracy);

      if (!dot)
        dot = L.marker(latlng, {
          icon: L.divIcon({
            className: "user-location-dot",
            iconSize: [16, 16],
          }),
          interactive: false,
        }).addTo(group);
      else dot.setLatLng(latlng);

      if (!didLocate.current) {
        didLocate.current = true;
        if (!initial.current) map.flyTo(latlng, 16);
      }
    });

    return () => {
      unsubscribe();
      group.clearLayers();
      group.remove();
    };
  }, [subscribePosition]);

  // Route calculation and polyline
  const routeOrigin = useRef(position);
  useEffect(() => {
    routeOrigin.current = position;
  }, [position]);

  useEffect(() => {
    setRoute(null);
    setRouteStatus("");
    if (!showRoute || !selected) return;
    const origin = routeOrigin.current;
    if (!online || !origin) {
      setRouteStatus("Route unavailable · straight-line distance shown");
      return;
    }
    const controller = new AbortController();
    setRouteStatus("Finding route…");
    const timer = setTimeout(() => {
      void fetchRoute(origin, selected.location, routeMode, controller.signal).then(
        (result) => {
          if (controller.signal.aborted) return;
          setRoute(result);
          setRouteStatus(
            result
              ? `${Math.max(1, Math.round(result.duration / 60))} min · ${formatDistance(result.distance)}`
              : "Route unavailable · straight-line distance shown",
          );
        },
      );
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [showRoute, selected, routeMode, online]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !route) return;
    const layer = L.geoJSON(route.geometry, {
      style: { color: "#2563eb", weight: 5, opacity: 0.85 },
    }).addTo(map);

    map.fitBounds(layer.getBounds(), {
      padding: [40, 40],
    });

    return () => {
      layer.remove();
    };
  }, [route]);

  const close = useCallback(() => {
    reverse.current?.abort();
    setSelected(null);
    onSelection(null);
    setShowRoute(false);
  }, [onSelection]);

  function handleLocateMe() {
    if (gps.includes("denied")) {
      showToast("Location access was disabled. Please enable GPS in browser settings.", "info");
      return;
    }
    const pos = rawPosition.current;
    if (pos && mapRef.current) {
      mapRef.current.flyTo([pos.lat, pos.lng], 17);
    } else {
      showToast("Waiting for GPS position…", "info");
    }
  }

  return (
    <div className="relative h-full w-full min-h-0 overflow-hidden bg-[#F8F6F2]">
      {/* Full-bleed Leaflet Map Canvas */}
      <div
        ref={container}
        className="absolute inset-0 z-0"
        aria-label="Interactive venue discovery map"
      />

      {/* When NOT in split-pane mode (e.g. mobile standalone view), render mobile floating panels */}
      {!splitPaneMode && (
        <div className="map-panel pointer-events-none absolute inset-3 z-20 flex flex-col justify-between">
          {/* Top Search & Nav Overlay (Mobile only) */}
          <div className="pointer-events-auto bg-white/95 rounded-2xl p-3 shadow-md border border-stone-200 space-y-2">
            {navigation}
            <div className="flex items-center gap-2">
              <input
                ref={searchInput}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search venues…"
                className="flex-1 h-9 px-3 rounded-xl border border-stone-200 bg-stone-50 text-xs text-stone-900 outline-none focus:border-amber-600"
              />
              {filters}
            </div>
            {statusTabs}
          </div>

          {/* Bottom Card / Drawer */}
          {selected ? (
            <div className="pointer-events-auto max-h-[70dvh] overflow-hidden">
              <VenueSheet
                embedded
                venue={
                  selected.record
                    ? (saved.find((v) => v.key === selected.key) ?? selected)
                    : selected
                }
                collections={collections}
                position={position}
                online={online}
                routeMode={routeMode}
                onMode={setRouteMode}
                showRoute={showRoute}
                onRoute={() => setShowRoute((v) => !v)}
                routeStatus={routeStatus}
                onClose={close}
                onSave={onSave}
              />
            </div>
          ) : (
            <div className="pointer-events-auto overflow-x-auto pb-1 flex gap-2">
              {spots.slice(0, 8).map((spot) => (
                <div key={spot.id} className="w-56 shrink-0">
                  <SpotCard
                    spot={spot}
                    distance={
                      position && !spot.locationMissing
                        ? haversine(position, spot.location)
                        : undefined
                    }
                    onSelect={(s) => choose(journalVenue(s))}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom-Right Floating Map Controls */}
      <div className="absolute right-3.5 bottom-6 z-20 flex flex-col items-center gap-2">
        {/* Discovery Status Pill */}
        <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 bg-white/95 text-stone-700 text-xs font-semibold rounded-full shadow-md border border-stone-200 pointer-events-none">
          <Compass className="w-3.5 h-3.5 text-amber-700 animate-spin-slow" />
          <span>{discoveryStatus}</span>
        </div>

        {/* Locate Me */}
        <button
          type="button"
          onClick={handleLocateMe}
          aria-label="Locate me on map"
          className="w-11 h-11 bg-white hover:bg-stone-50 text-stone-700 active:text-amber-700 rounded-xl shadow-md border border-stone-200/90 flex items-center justify-center transition-all cursor-pointer active:scale-95"
          title="Locate me"
        >
          <Navigation className="w-5 h-5 text-amber-700" />
        </button>

        {/* Zoom In & Out Controls */}
        <div className="bg-white rounded-xl shadow-md border border-stone-200/90 overflow-hidden flex flex-col">
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn()}
            aria-label="Zoom in"
            className="w-11 h-10 hover:bg-stone-50 text-stone-700 flex items-center justify-center border-b border-stone-100 transition-colors cursor-pointer active:scale-95"
          >
            <Plus className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut()}
            aria-label="Zoom out"
            className="w-11 h-10 hover:bg-stone-50 text-stone-700 flex items-center justify-center transition-colors cursor-pointer active:scale-95"
          >
            <Minus className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
