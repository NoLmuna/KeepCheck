"use client";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
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
const symbols = {
  coffee: "☕",
  restaurant: "🍴",
  bakery: "🥐",
  bar: "🍷",
  other: "📍",
};
interface Props {
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
  const { online, position, gps } = context;
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
  useEffect(() => {
    // Synchronize selections from the journal and randomizer with Leaflet.
    if (externalSelection) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelected(externalSelection);
      setShowRoute(false);
      if (!externalSelection.record?.locationMissing)
        mapRef.current?.flyTo(
          [externalSelection.location.lat, externalSelection.location.lng],
          17,
        );
    }
  }, [externalSelection]);
  const choose = useCallback((venue: Venue) => {
    reverse.current?.abort();
    setSelected(venue);
    setShowRoute(false);
    setRoute(null);
    setRouteStatus("");
    setQuery("");
    setResults([]);
    mapRef.current?.flyTo([venue.location.lat, venue.location.lng], 17);
  }, []);
  useEffect(() => {
    if (!container.current) return;
    const p = initial.current;
    const map = L.map(container.current, { zoomControl: false }).setView(
      p ? [p.lat, p.lng] : [14.5995, 120.9842],
      p ? 16 : 13,
    );
    mapRef.current = map;
    L.control.zoom({ position: "bottomright" }).addTo(map);
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
          {
            south: b.getSouth(),
            west: b.getWest(),
            north: b.getNorth(),
            east: b.getEast(),
          },
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
        position,
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
  }, [query, position, online, saved]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const group = L.layerGroup().addTo(map);

    const venues = [
      ...pois.filter(
        (v) =>
          !allSpots.some(
            (s) => s.location.osmId && s.location.osmId === v.location.osmId,
          ),
      ),
      ...saved,
    ];
    if (selected && !venues.some((v) => v.key === selected.key))
      venues.push(selected);
    for (const v of venues) {
      const active = v.key === selected?.key;
      const element = document.createElement("div");
      element.className = `venue-marker ${v.record ? (v.record.status === "wishlist" ? "venue-marker-wishlist" : "venue-marker-saved") : "venue-marker-poi"} ${active ? "venue-marker-active" : ""}`;
      element.textContent = v.record
        ? v.record.status === "wishlist"
          ? "🔖"
          : `${symbols[v.category]} ${v.record.overallRating?.toFixed(1) ?? ""}`
        : symbols[v.category];
      const marker = L.marker([v.location.lat, v.location.lng], {
        icon: L.divIcon({
          html: element,
          className: "venue-marker-wrapper",
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        }),
        title: v.name,
        alt: v.name,
        bubblingMouseEvents: false,
        zIndexOffset: active ? 1000 : v.record ? 500 : 0,
      }).addTo(group);
      marker
        .getElement()
        ?.setAttribute(
          "aria-label",
          `${v.record ? "Saved spot" : "Discover"}: ${v.name}`,
        );
      marker.on("click", () => choose(v));
    }
    return () => {
      group.eachLayer((layer) => layer.off());
      group.clearLayers();
      group.remove();
    };
  }, [pois, saved, selected, choose, allSpots]);
  const didLocate = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position) return;
    const group = L.layerGroup().addTo(map);
    L.circle([position.lat, position.lng], {
      radius: position.accuracy,
      weight: 1,
      color: "#2563eb",
      fillOpacity: 0.1,
      interactive: false,
    }).addTo(group);
    L.marker([position.lat, position.lng], {
      icon: L.divIcon({ className: "user-location-dot", iconSize: [16, 16] }),
      interactive: false,
    }).addTo(group);
    if (!didLocate.current) {
      didLocate.current = true;
      if (!initial.current && !selected)
        map.flyTo([position.lat, position.lng], 16);
    }
    return () => {
      group.clearLayers();
      group.remove();
    };
  }, [position, selected]);
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
      paddingTopLeft: [30, 140],
      paddingBottomRight: [30, Math.min(map.getSize().y * 0.45, 340)],
    });
    return () => {
      layer.remove();
    };
  }, [route]);
  const cards = saved;
  return (
    <div className="venue-map relative h-full min-h-0 overflow-hidden">
      <div
        ref={container}
        className="absolute inset-0 z-0 bg-bg"
        aria-label="Venue discovery map"
      />
      <div className="absolute left-3 right-3 top-3 z-[500] sm:right-auto sm:w-96">
        <input
          aria-label="Search venues by name"
          placeholder="Search coffee, restaurants, places…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-2xl border bg-bg p-3 shadow-lg"
        />
        {query.length >= 2 && (
          <div
            className="mt-1 max-h-[35dvh] overflow-auto rounded-xl bg-bg shadow-lg"
            aria-label="Search results"
          >
            {results.map((v) => (
              <button
                key={v.key}
                aria-label={`Select ${v.name}`}
                onClick={() => choose(v)}
                className="block w-full border-b p-3 text-left"
              >
                <strong>{v.name}</strong>
                <span className="block text-xs">
                  {v.location.formattedAddress}
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
        <div className="mt-2 flex flex-wrap gap-1 text-xs" role="status">
          <span className="rounded-full bg-bg px-2 py-1">
            {online ? "Online" : "Offline Mode"}
          </span>
          <span className="rounded-full bg-bg px-2 py-1">{gps}</span>
          <span className="rounded-full bg-bg px-2 py-1">
            {pending} pending sync
          </span>
        </div>
        <p className="mt-1 w-fit rounded bg-bg/95 px-2 py-1 text-xs">
          {discoveryStatus}
        </p>
      </div>
      <button
        aria-label="Locate me"
        disabled={!position}
        onClick={() =>
          position && mapRef.current?.flyTo([position.lat, position.lng], 17)
        }
        className="absolute right-3 top-44 z-[500] rounded-xl bg-bg p-3 shadow-lg disabled:opacity-50"
      >
        ◎ Locate me
      </button>
      {selected ? (
        <VenueSheet
          key={selected.key}
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
          onClose={() => {
            reverse.current?.abort();
            setSelected(null);
            onSelection(null);
            setShowRoute(false);
          }}
          onSave={onSave}
        />
      ) : (
        <section
          aria-label="Saved spots"
          className="absolute bottom-7 left-3 right-16 z-[500] rounded-2xl bg-bg/95 p-3 shadow-lg sm:max-w-lg"
        >
          <div className="flex items-center justify-between gap-2">
            <strong>Saved spots · {cards.length}</strong>
          </div>
          <div className="flex gap-2 overflow-x-auto pt-2">
            {cards.map((v) => (
              <button
                key={v.key}
                aria-label={`View ${v.name}`}
                onClick={() => choose(v)}
                className="min-w-40 rounded-xl border p-3 text-left"
              >
                <strong className="block">
                  {symbols[v.category]} {v.name}
                </strong>
                <span className="block text-xs">
                  {position
                    ? `${formatDistance(haversine(position, v.location))} away`
                    : v.location.locality || v.location.formattedAddress}
                </span>
              </button>
            ))}
          </div>
          {!cards.length && (
            <p className="text-sm">
              Search a venue or tap the map to log your first spot.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
