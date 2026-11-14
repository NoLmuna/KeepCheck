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
const symbols = {
  coffee: "☕",
  restaurant: "🍴",
  bakery: "🥐",
  bar: "🍷",
  other: "📍",
};
interface Props {
  navigation: ReactNode;
  filters: ReactNode;
  statusTabs: ReactNode;
  syncError?: string | null;
  spots: Spot[];
  allSpots: Spot[];
  collections: SpotCollection[];
  onSave: SaveVenue;
  context: ReturnType<typeof useMapContext>;
  pending: number;
  externalSelection: Venue | null;
  onSelection: (venue: Venue | null) => void;
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
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const { online, position, gps, rawPosition, subscribePosition } = context;
  const searchInput = useRef<HTMLInputElement>(null);
  const [activeResult, setActiveResult] = useState(-1);
  const [statusOpen, setStatusOpen] = useState(false);
  const [selected, setSelected] = useState<Venue | null>(null);
  const [pois, setPois] = useState<Venue[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Venue[]>([]);
  const [searchStatus, setSearchStatus] = useState("");
  const [discoveryStatus, setDiscoveryStatus] = useState(
    "Zoom in to discover venues",
  );

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
    const point = map.project([venue.location.lat, venue.location.lng], 17);
    if (window.innerWidth >= 768)
      point.x -= (window.innerWidth >= 1024 ? 400 : 380) / 2;
    map.flyTo(map.unproject(point, 17), 17);
  }, []);
  useEffect(() => {
    // Synchronize selections from the journal and randomizer with Leaflet.
    if (externalSelection) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelected(externalSelection);
      setShowRoute(false);
      flyToVenue(externalSelection);
    }
  }, [externalSelection, flyToVenue]);
  const choose = useCallback(
    (venue: Venue) => {
      reverse.current?.abort();
      setSelected(venue);
      setShowRoute(false);
      setRoute(null);
      setRouteStatus("");
      setQuery("");
      setResults([]);
      flyToVenue(venue);
    },
    [flyToVenue],
  );
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
        key: `pin-${location.lat}-${location.lng}`,
        name: "Dropped pin",
        category: "other",
        location,
      };
      setSelected(venue);
      setShowRoute(false);
      setRoute(null);
      setRouteStatus("");
      void reverseLocation(location, controller.signal).then((resolved) => {
        if (!controller.signal.aborted)
          setSelected((current) =>
            current?.key === venue.key
              ? { ...current, location: resolved }
              : current,
          );
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
  }, []);
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
        setDiscoveryStatus("Zoom in to discover venues");
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
        if (venues) setPois(venues);
        setDiscoveryStatus(
          venues
            ? `${venues.length} nearby venues${online ? "" : " · cached"}`
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
  useEffect(() => {
    const controller = new AbortController();
    // Reset the previous external search response before starting a new request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  const markers = useRef(new Map<string, { marker: L.Marker; venue: Venue }>());
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    const ids = new Set(
      allSpots.flatMap((s) => (s.location.osmId ? [s.location.osmId] : [])),
    );
    const venues = [...nearestPois(pois, center, ids), ...saved];
    if (
      selected &&
      !selected.record?.locationMissing &&
      !venues.some((v) => v.key === selected.key)
    ) {
      if (!selected.record && venues.filter((v) => !v.record).length >= 40)
        venues.splice(39, 1);
      venues.push(selected);
    }
    const keys = new Set(venues.map((v) => v.key));
    for (const [key, entry] of markers.current)
      if (!keys.has(key)) {
        entry.marker.off();
        entry.marker.remove();
        markers.current.delete(key);
      }
    for (const venue of venues) {
      let entry = markers.current.get(venue.key);
      const className = `venue-marker ${venue.record ? (venue.record.status === "wishlist" ? "venue-marker-wishlist" : "venue-marker-saved") : "venue-marker-poi"}`;
      const label =
        venue.record?.status === "wishlist"
          ? "🔖"
          : symbols[venue.category] +
            (venue.record
              ? ` ${venue.record.overallRating?.toFixed(1) ?? ""}`
              : "");
      if (!entry) {
        const marker = L.marker([venue.location.lat, venue.location.lng], {
          icon: L.divIcon({
            html: label,
            className,
            iconSize: [44, 44],
            iconAnchor: [22, 22],
          }),
          bubblingMouseEvents: false,
          title: venue.name,
          keyboard: true,
        }).addTo(map);
        entry = { marker, venue };
        markers.current.set(venue.key, entry);
        const current = entry;
        marker.on("click", () => choose(current.venue));
      } else {
        entry.venue = venue;
        const old = entry.marker.getLatLng();
        if (old.lat !== venue.location.lat || old.lng !== venue.location.lng)
          entry.marker.setLatLng([venue.location.lat, venue.location.lng]);
      }
      const element = entry.marker.getElement();
      if (element) {
        element.classList.toggle(
          "venue-marker-active",
          venue.key === selected?.key,
        );
        element.setAttribute(
          "aria-label",
          `${venue.record ? "Saved spot" : "Discover"}: ${venue.name}`,
        );
        element.title = venue.name;
        if (element.textContent !== label) element.textContent = label;
      }
      entry.marker.setZIndexOffset(
        venue.key === selected?.key ? 1000 : venue.record ? 500 : 0,
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
          fillOpacity: 0.1,
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
  const routeOrigin = useRef(position);
  useEffect(() => {
    routeOrigin.current = position;
  }, [position]);
  useEffect(() => {
    // Remove geometry from the previous external route request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      void fetchRoute(
        origin,
        selected.location,
        routeMode,
        controller.signal,
      ).then((result) => {
        if (controller.signal.aborted) return;
        setRoute(result);
        setRouteStatus(
          result
            ? `${Math.max(1, Math.round(result.duration / 60))} min · ${formatDistance(result.distance)}`
            : "Route unavailable · straight-line distance shown",
        );
      });
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
      style: { color: "#2563eb", weight: 5 },
    }).addTo(map);
    map.fitBounds(layer.getBounds(), {
      paddingTopLeft: [
        window.innerWidth >= 768 ? (window.innerWidth >= 1024 ? 432 : 412) : 30,
        140,
      ],
      paddingBottomRight: [
        60,
        window.innerWidth >= 768 ? 30 : Math.min(map.getSize().y * 0.45, 340),
      ],
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
  const selectSpot = useCallback(
    (spot: Spot) => choose(journalVenue(spot)),
    [choose],
  );
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (document.querySelector("[role=dialog]")) return;
      const target = event.target;
      if (
        (event.key === "k" && (event.ctrlKey || event.metaKey)) ||
        (event.key === "/" &&
          !(
            target instanceof HTMLElement &&
            (target.isContentEditable ||
              /INPUT|TEXTAREA|SELECT/.test(target.tagName))
          ))
      ) {
        event.preventDefault();
        searchInput.current?.focus();
      }
      if (event.key === "Escape") {
        setQuery("");
        setStatusOpen(false);
        close();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [close]);
  return (
    <div className="venue-map relative h-full min-h-0 overflow-hidden">
      <div
        ref={container}
        className="absolute inset-0 z-0 bg-bg"
        aria-label="Venue discovery map"
      />
      <div className="map-panel" data-selected={!!selected}>
        <div className="map-panel-header">
          {navigation}
          <div className="map-search flex items-center gap-2">
            <input
              ref={searchInput}
              className="min-w-0 flex-1 rounded-xl border p-3"
              role="combobox"
              aria-label="Search venues by name"
              aria-autocomplete="list"
              aria-controls="venue-search-results"
              aria-expanded={query.length >= 2}
              aria-activedescendant={
                activeResult >= 0 && results[activeResult]
                  ? `venue-result-${activeResult}`
                  : undefined
              }
              placeholder="Search venues…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveResult(-1);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveResult((i) =>
                    results.length
                      ? (i +
                          (e.key === "ArrowDown" ? 1 : -1) +
                          results.length) %
                        results.length
                      : -1,
                  );
                }
                if (e.key === "Enter" && results[activeResult]) {
                  e.preventDefault();
                  choose(results[activeResult]);
                }
                if (e.key === "Escape" && query) {
                  e.stopPropagation();
                  setQuery("");
                }
              }}
            />
            {filters}
            {query.length >= 2 && (
              <div
                id="venue-search-results"
                role="listbox"
                aria-label="Search results"
                className="search-results"
              >
                {results.map((v, index) => (
                  <button
                    id={`venue-result-${index}`}
                    role="option"
                    aria-selected={activeResult === index}
                    key={v.key}
                    aria-label={`Select ${v.name}`}
                    onClick={() => choose(v)}
                    className="block w-full border-b p-3 text-left"
                  >
                    <strong>{v.name}</strong>
                    <span className="block text-xs">
                      {v.location.locality || v.location.formattedAddress}
                    </span>
                  </button>
                ))}
                {searchStatus && (
                  <p role="status" className="p-3 text-xs">
                    {searchStatus}
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="mt-2">{statusTabs}</div>
        </div>
        {selected ? (
          <VenueSheet
            key={selected.key}
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
        ) : (
          <section aria-label="Saved spots" className="map-saved-list">
            <p className="px-3 py-2 text-xs">Saved spots · {spots.length}</p>
            <div className="map-cards">
              {spots.map((spot) => (
                <SpotCard
                  key={spot.id}
                  spot={spot}
                  distance={
                    position && !spot.locationMissing
                      ? haversine(position, spot.location)
                      : undefined
                  }
                  onSelect={selectSpot}
                />
              ))}
            </div>
            {!spots.length && (
              <p className="p-3 text-sm">
                Search a venue or tap the map to log your first spot.
              </p>
            )}
          </section>
        )}
      </div>
      <div className="map-corner journal-controls">
        {statusOpen && (
          <div role="status" className="map-status">
            <p>{online ? "Online" : "Offline Mode"}</p>
            <p>{gps}</p>
            <p>{pending} pending sync</p>
            <p>{discoveryStatus}</p>
            {syncError && <p>Sync paused · data is safe on this device.</p>}
          </div>
        )}
        <button
          aria-label="Map connection and GPS status"
          aria-expanded={statusOpen}
          title={`${online ? "Online" : "Offline Mode"} · ${gps} · ${pending} pending sync`}
          onClick={() => setStatusOpen((v) => !v)}
        >
          <span
            aria-hidden="true"
            className={`status-dot ${online ? "online" : ""}`}
          />
        </button>
        <button
          aria-label="Locate me"
          disabled={!position}
          onClick={() => {
            const p = rawPosition.current;
            if (p) mapRef.current?.flyTo([p.lat, p.lng], 17);
          }}
        >
          ◎
        </button>
        <button aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()}>
          +
        </button>
        <button aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()}>
          −
        </button>
      </div>
    </div>
  );
}
