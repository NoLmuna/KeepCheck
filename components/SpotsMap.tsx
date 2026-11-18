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
  Search,
  X,
  Check,
  Loader2,
  RefreshCw,
  Star,
  Bookmark,
  ChevronUp,
} from "lucide-react";
import { db } from "@/app/db";
import type { Spot, SpotCollection, SpotLocation } from "@/lib/models";
import {
  coordinateLabel,
  formatDistance,
  haversine,
  journalVenue,
  type Coordinates,
  type Venue,
} from "@/lib/geo";
import {
  discoverVenues,
  fetchRoute,
  lookupClickLocation,
  searchVenues,
  getOpeningHoursStatus,
  reverseLocation,
  type Route,
} from "@/lib/osm";
import type { useMapContext } from "@/lib/useMapContext";
import VenueSheet, { type SaveVenue } from "./VenueSheet";
import { nearestPois, discoveryBounds } from "@/lib/mapPerformance";
import SpotCard from "./SpotCard";
import { useToast } from "@/lib/toast";

const categorySvgs: Record<string, string> = {
  coffee: `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h12Z"/><path d="M6 2v2"/><line x1="17" x2="21" y1="12" y2="12"/><line x1="17" x2="21" y1="16" y2="16"/></svg>`,
  restaurant: `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2"/><path d="M15 2v10"/><path d="M12 2v6"/><path d="M21 15v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5"/><line x1="2" x2="22" y1="15" y2="15"/></svg>`,
  bakery: `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 16.5-1-2.5a3 3 0 0 1 .5-3L9 6l3 2.5 3-2.5 5 5a3 3 0 0 1 .5 3l-1 2.5"/><path d="M4 14h16"/></svg>`,
  bar: `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 22h8"/><path d="M12 15v7"/><path d="M12 15a5 5 0 0 0 5-5V2H7v8a5 5 0 0 0 5 5Z"/></svg>`,
  other: `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
};

const bookmarkSvg = `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>`;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getCategoryDisplayName(cat: Venue["category"]): string {
  switch (cat) {
    case "coffee":
      return "Coffee / Café";
    case "bakery":
      return "Bakery";
    case "bar":
      return "Bar / Pub";
    case "restaurant":
      return "Restaurant / Fast Food";
    default:
      return "Food & Drink";
  }
}

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
  onSelection: (venue: Venue | null, initialAction?: "visit" | "wishlist") => void;
  splitPaneMode?: boolean;
  adjustingSpot?: Spot | null;
  onCancelAdjustPin?: () => void;
  onConfirmAdjustPin?: (spot: Spot, location: SpotLocation) => Promise<void>;
  externalSearchQuery?: string | null;
  onClearExternalSearch?: () => void;
}

export default function SpotsMap({
  navigation,
  filters,
  statusTabs,
  spots,
  allSpots,
  collections,
  onSave,
  context,
  externalSelection,
  onSelection,
  splitPaneMode = false,
  adjustingSpot,
  onCancelAdjustPin,
  onConfirmAdjustPin,
  externalSearchQuery,
  onClearExternalSearch,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const droppedPinMarkerRef = useRef<L.Marker | null>(null);
  const currentPopupRef = useRef<L.Popup | null>(null);
  const lastMarkerClickTimeRef = useRef<number>(0);

  const { online, position, gps, rawPosition, subscribePosition } = context;
  const { showToast } = useToast();

  const [selected, setSelected] = useState<Venue | null>(externalSelection);
  const [activeDroppedPin, setActiveDroppedPin] = useState<{
    venue: Venue;
    isLoading: boolean;
    addressLabel: string;
    nearbyStores?: Venue[];
  } | null>(null);
  const [pois, setPois] = useState<Venue[]>([]);
  const poisRef = useRef<Venue[]>([]);
  useEffect(() => {
    poisRef.current = pois;
  }, [pois]);

  // Floating search state
  const [mapSearchQuery, setMapSearchQuery] = useState("");
  const [mapSearchResults, setMapSearchResults] = useState<Venue[]>([]);
  const [isSearchingPhoton, setIsSearchingPhoton] = useState(false);
  const [mapSearchOpen, setMapSearchOpen] = useState(false);
  const mapSearchContainerRef = useRef<HTMLDivElement>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  // Discovery state
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [hasPannedAway, setHasPannedAway] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(16);
  const [discoveryStatus, setDiscoveryStatus] = useState("Zoom in to see nearby spots");
  const lastScannedCenterRef = useRef<Coordinates | null>(null);
  const triggerDiscoveryRef = useRef<() => void>(() => {});

  // Interactive nearby spots drawer state (bottom-right)
  const [nearbyDrawerOpen, setNearbyDrawerOpen] = useState(false);
  const nearbyDrawerRef = useRef<HTMLDivElement>(null);
  const nearbyButtonRef = useRef<HTMLButtonElement>(null);

  const [routeMode, setRouteMode] = useState<"foot" | "driving">("foot");
  const [showRoute, setShowRoute] = useState(false);
  const [route, setRoute] = useState<Route | null>(null);
  const [routeStatus, setRouteStatus] = useState("");
  const reverse = useRef<AbortController | null>(null);

  const onSelectionRef = useRef(onSelection);
  useEffect(() => {
    onSelectionRef.current = onSelection;
  });

  // Pin placement / adjustment mode state
  const [internalAdjustingSpot, setInternalAdjustingSpot] = useState<Spot | null>(null);
  const activeAdjustingSpot = adjustingSpot ?? internalAdjustingSpot;
  const adjustingSpotRef = useRef<Spot | null>(null);
  useEffect(() => {
    adjustingSpotRef.current = activeAdjustingSpot;
  }, [activeAdjustingSpot]);

  const [adjustedCoords, setAdjustedCoords] = useState<Coordinates | null>(null);
  const [adjustedAddress, setAdjustedAddress] = useState<string>("");
  const [adjustedLocality, setAdjustedLocality] = useState<string>("");
  const [isResolvingAdjustedAddress, setIsResolvingAdjustedAddress] = useState(false);
  const adjustPinMarkerRef = useRef<L.Marker | null>(null);
  const reverseAbortRef = useRef<AbortController | null>(null);

  // Sync external search query from sidebar
  useEffect(() => {
    if (externalSearchQuery && externalSearchQuery.trim().length > 0) {
      setMapSearchQuery(externalSearchQuery.trim());
      setMapSearchOpen(true);
      onClearExternalSearch?.();
    }
  }, [externalSearchQuery, onClearExternalSearch]);

  const saved = useMemo(
    () =>
      spots.flatMap((s) => {
        if (
          s.locationMissing ||
          !s.location ||
          !Number.isFinite(s.location.lat) ||
          !Number.isFinite(s.location.lng) ||
          (s.location.lat === 0 && s.location.lng === 0)
        ) {
          return [];
        }
        const v = journalVenue(s);
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
    if (
      !map ||
      !venue ||
      !venue.location ||
      !Number.isFinite(venue.location.lat) ||
      !Number.isFinite(venue.location.lng) ||
      (venue.location.lat === 0 && venue.location.lng === 0) ||
      venue.record?.locationMissing
    ) {
      return;
    }

    const targetZoom = Math.max(map.getZoom(), 16);
    const latlng = L.latLng(venue.location.lat, venue.location.lng);
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

    // Viewport insets in pixels
    // Top: floating search bar + discovery pill (~110px)
    // Bottom: mobile bottom drawer/nav (~120px) vs desktop minimal controls (~30px)
    const topInset = 110;
    const bottomInset = isMobile ? 120 : 30;
    const dx = 0;
    const dy = (topInset - bottomInset) / 2;

    const projected = map.project(latlng, targetZoom);
    const adjustedPoint = L.point(projected.x - dx, projected.y - dy);
    const adjustedLatLng = map.unproject(adjustedPoint, targetZoom);

    map.flyTo(adjustedLatLng, targetZoom, {
      duration: 0.6,
    });
  }, []);

  const hasAutoCentered = useRef(false);

  // Auto-center map when saved spots or external selection become available
  useEffect(() => {
    const map = mapRef.current;
    if (!map || hasAutoCentered.current) return;

    if (externalSelection && !externalSelection.record?.locationMissing) {
      hasAutoCentered.current = true;
      flyToVenue(externalSelection);
      return;
    }

    if (saved.length > 0) {
      hasAutoCentered.current = true;
      if (saved.length === 1) {
        flyToVenue(saved[0]);
      } else {
        const bounds = L.latLngBounds(
          saved.map((v) => [v.location.lat, v.location.lng] as L.LatLngTuple),
        );
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
      }
    }
  }, [saved, externalSelection, flyToVenue]);

  useEffect(() => {
    if (externalSelection) {
      setSelected(externalSelection);
      setShowRoute(false);
      flyToVenue(externalSelection);
    } else {
      setSelected(null);
    }
  }, [externalSelection, flyToVenue]);

  const clearDroppedPin = useCallback(() => {
    setActiveDroppedPin(null);
    if (droppedPinMarkerRef.current) {
      droppedPinMarkerRef.current.remove();
      droppedPinMarkerRef.current = null;
    }
    if (currentPopupRef.current) {
      currentPopupRef.current.remove();
      currentPopupRef.current = null;
    }
  }, []);

  const choose = useCallback(
    (venue: Venue) => {
      reverse.current?.abort();
      clearDroppedPin();
      setSelected(venue);
      onSelectionRef.current?.(venue);
      setShowRoute(false);
      setRoute(null);
      setRouteStatus("");
      setMapSearchQuery("");
      setMapSearchResults([]);
      setMapSearchOpen(false);
      setNearbyDrawerOpen(false);
      flyToVenue(venue);
    },
    [flyToVenue, clearDroppedPin],
  );

  // Close search dropdown or nearby drawer on click outside
  useEffect(() => {
    if (!mapSearchOpen && !nearbyDrawerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (mapSearchOpen && !mapSearchContainerRef.current?.contains(target)) {
        setMapSearchOpen(false);
      }
      if (
        nearbyDrawerOpen &&
        !nearbyDrawerRef.current?.contains(target) &&
        !nearbyButtonRef.current?.contains(target)
      ) {
        setNearbyDrawerOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMapSearchOpen(false);
        setNearbyDrawerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mapSearchOpen, nearbyDrawerOpen]);

  // Photon Autocomplete Search with Proximity Bias to Map Center
  useEffect(() => {
    searchAbortRef.current?.abort();
    if (mapSearchQuery.trim().length < 2) {
      setMapSearchResults([]);
      setIsSearchingPhoton(false);
      return;
    }

    const controller = new AbortController();
    searchAbortRef.current = controller;
    setIsSearchingPhoton(true);
    setMapSearchOpen(true);

    // Local saved matches first
    const qLower = mapSearchQuery.trim().toLowerCase();
    const localMatched = saved.filter(
      (v) =>
        v.name.toLowerCase().includes(qLower) ||
        v.location.formattedAddress?.toLowerCase().includes(qLower) ||
        v.location.locality?.toLowerCase().includes(qLower),
    );
    setMapSearchResults(localMatched);

    const timer = setTimeout(async () => {
      try {
        const center = mapRef.current?.getCenter() ?? rawPosition.current;
        const centerCoords = center ? { lat: center.lat, lng: center.lng } : null;
        const found = await searchVenues(
          mapSearchQuery.trim(),
          centerCoords,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (found) {
          const savedOsmIds = new Set(
            localMatched.map((s) => s.location.osmId).filter(Boolean),
          );
          const combined = [
            ...localMatched,
            ...found.filter(
              (f) => !f.location.osmId || !savedOsmIds.has(f.location.osmId),
            ),
          ];
          setMapSearchResults(combined);
        }
      } catch {
        // Ignore abort/network errors
      } finally {
        if (!controller.signal.aborted) {
          setIsSearchingPhoton(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [mapSearchQuery, saved, rawPosition]);

  // Helper to render dropped pin with bounce animation
  const renderDroppedPin = useCallback((latlng: L.LatLng) => {
    const map = mapRef.current;
    if (!map) return;
    if (droppedPinMarkerRef.current) {
      droppedPinMarkerRef.current.remove();
      droppedPinMarkerRef.current = null;
    }
    const pinDiv = document.createElement("div");
    pinDiv.className = "relative flex items-center justify-center animate-pin-drop";
    pinDiv.innerHTML = `
      <div class="absolute -bottom-1 w-9 h-9 rounded-full bg-amber-500/35 animate-pin-ring pointer-events-none"></div>
      <div class="relative z-10 w-9 h-9 rounded-full bg-gradient-to-tr from-amber-700 to-amber-500 text-white flex items-center justify-center shadow-lg border-2 border-white ring-2 ring-amber-600/30">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </div>
    `;
    const pinMarker = L.marker(latlng, {
      icon: L.divIcon({
        html: pinDiv,
        className: "keepcheck-marker cursor-pointer",
        iconSize: [36, 36],
        iconAnchor: [18, 36],
      }),
      zIndexOffset: 1500,
    }).addTo(map);

    pinMarker.on("click", (e) => {
      L.DomEvent.stopPropagation(e);
      lastMarkerClickTimeRef.current = Date.now();
      if (currentPopupRef.current) {
        currentPopupRef.current.openOn(map);
      }
    });

    droppedPinMarkerRef.current = pinMarker;
  }, []);

  const updateAdjustedPosition = useCallback((coords: Coordinates) => {
    setAdjustedCoords(coords);
    if (adjustPinMarkerRef.current) {
      adjustPinMarkerRef.current.setLatLng([coords.lat, coords.lng]);
    }

    reverseAbortRef.current?.abort();
    const controller = new AbortController();
    reverseAbortRef.current = controller;
    setIsResolvingAdjustedAddress(true);

    const timer = setTimeout(async () => {
      try {
        const resolved = await reverseLocation(coords, controller.signal);
        if (!controller.signal.aborted) {
          setAdjustedAddress(resolved.formattedAddress || coordinateLabel(coords));
          setAdjustedLocality(resolved.locality || "");
        }
      } catch {
        if (!controller.signal.aborted) {
          setAdjustedAddress(coordinateLabel(coords));
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsResolvingAdjustedAddress(false);
        }
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!activeAdjustingSpot) {
      if (adjustPinMarkerRef.current) {
        adjustPinMarkerRef.current.remove();
        adjustPinMarkerRef.current = null;
      }
      setAdjustedCoords(null);
      setAdjustedAddress("");
      setAdjustedLocality("");
      return;
    }

    // Close any open popups or drawers
    map.closePopup();
    setNearbyDrawerOpen(false);
    setMapSearchOpen(false);

    const hasValidCoords =
      activeAdjustingSpot.location &&
      Number.isFinite(activeAdjustingSpot.location.lat) &&
      Number.isFinite(activeAdjustingSpot.location.lng) &&
      !activeAdjustingSpot.locationMissing;

    const center = map.getCenter();
    const initialCoords: Coordinates = hasValidCoords
      ? { lat: activeAdjustingSpot.location.lat, lng: activeAdjustingSpot.location.lng }
      : { lat: center.lat, lng: center.lng };

    setAdjustedCoords(initialCoords);
    setAdjustedAddress(activeAdjustingSpot.location?.formattedAddress || coordinateLabel(initialCoords));
    setAdjustedLocality(activeAdjustingSpot.location?.locality || "");

    map.flyTo([initialCoords.lat, initialCoords.lng], Math.max(map.getZoom(), 16), {
      duration: 0.5,
    });

    const adjustIcon = L.divIcon({
      className: "adjust-pin-marker",
      html: `
        <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-full cursor-grab active:cursor-grabbing">
          <div class="w-10 h-10 rounded-2xl bg-amber-600 text-white flex items-center justify-center shadow-2xl border-2 border-white ring-4 ring-amber-500/40 animate-pulse">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 40],
    });

    if (adjustPinMarkerRef.current) {
      adjustPinMarkerRef.current.remove();
    }

    const marker = L.marker([initialCoords.lat, initialCoords.lng], {
      icon: adjustIcon,
      draggable: true,
      zIndexOffset: 2000,
    }).addTo(map);

    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      updateAdjustedPosition({ lat: pos.lat, lng: pos.lng });
    });

    adjustPinMarkerRef.current = marker;

    return () => {
      marker.remove();
      adjustPinMarkerRef.current = null;
    };
  }, [activeAdjustingSpot, updateAdjustedPosition]);

  const handleConfirmAdjustPin = useCallback(async () => {
    if (!activeAdjustingSpot || !adjustedCoords) return;

    const newLoc: SpotLocation = {
      lat: adjustedCoords.lat,
      lng: adjustedCoords.lng,
      formattedAddress: adjustedAddress || coordinateLabel(adjustedCoords),
      ...(adjustedLocality ? { locality: adjustedLocality } : {}),
      osmId: activeAdjustingSpot.location?.osmId,
    };

    if (onConfirmAdjustPin) {
      await onConfirmAdjustPin(activeAdjustingSpot, newLoc);
    } else {
      const now = Math.max(Date.now(), activeAdjustingSpot.updatedAt + 1);
      await db.venues.update(activeAdjustingSpot.id, {
        location: newLoc,
        locationMissing: false,
        updatedAt: now,
        syncStatus: "pending",
      });
      const updated = await db.venues.get(activeAdjustingSpot.id);
      if (updated) {
        setSelected(journalVenue(updated));
      }
      showToast(`Pin updated for ${activeAdjustingSpot.name}`, "success");
    }

    setInternalAdjustingSpot(null);
    if (adjustPinMarkerRef.current) {
      adjustPinMarkerRef.current.remove();
      adjustPinMarkerRef.current = null;
    }
  }, [activeAdjustingSpot, adjustedCoords, adjustedAddress, adjustedLocality, onConfirmAdjustPin, showToast]);

  const handleCancelAdjustPin = useCallback(() => {
    setInternalAdjustingSpot(null);
    onCancelAdjustPin?.();
    if (adjustPinMarkerRef.current) {
      adjustPinMarkerRef.current.remove();
      adjustPinMarkerRef.current = null;
    }
  }, [onCancelAdjustPin]);

  // Function to open the compact floating popover card directly above a pin/POI
  const openVenuePopover = useCallback(
    (
      venue: Venue,
      latlng: L.LatLng,
      isLoading = false,
      initialNearbyStores: Venue[] = [],
      customSubtitle?: string,
    ) => {
      const map = mapRef.current;
      if (!map) return;

      const activeVenue = { ...venue };

      const popupDiv = document.createElement("div");
      popupDiv.className = "p-3 space-y-2 min-w-[220px] max-w-[275px] font-sans";

      // Category Pill / Tag
      const categoryContainer = document.createElement("div");
      categoryContainer.className = "flex items-center gap-1.5 flex-wrap";

      const catName = getCategoryDisplayName(activeVenue.category);
      const catIconSvg = categorySvgs[activeVenue.category] ?? categorySvgs.other;

      const catBadge = document.createElement("span");
      catBadge.className =
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60";
      catBadge.innerHTML = `<span class="w-3 h-3 flex items-center justify-center">${catIconSvg}</span><span>${catName}</span>`;
      categoryContainer.appendChild(catBadge);

      // Opening hours status badge if available
      const hoursStatus = getOpeningHoursStatus(activeVenue.openingHours);
      if (hoursStatus) {
        const hoursBadge = document.createElement("span");
        if (hoursStatus === "open") {
          hoursBadge.className =
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60";
          hoursBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span><span>Open now</span>`;
        } else {
          hoursBadge.className =
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-stone-700";
          hoursBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-stone-400"></span><span>Closed</span>`;
        }
        categoryContainer.appendChild(hoursBadge);
      }

      popupDiv.appendChild(categoryContainer);

      const titleEl = document.createElement("h4");
      titleEl.className = "font-serif font-bold text-sm text-stone-900 dark:text-white truncate";
      titleEl.textContent = isLoading ? "Locating spot…" : venue.name;
      popupDiv.appendChild(titleEl);

      const addrEl = document.createElement("p");
      addrEl.className = "text-[11px] text-stone-500 dark:text-stone-400 truncate";
      addrEl.textContent = isLoading
        ? "Resolving address…"
        : (customSubtitle || venue.location.locality || venue.location.formattedAddress || "Selected point");
      popupDiv.appendChild(addrEl);

      const btnContainer = document.createElement("div");
      btnContainer.className =
        "grid grid-cols-2 gap-1.5 pt-1.5 border-t border-stone-200/80 dark:border-stone-700/80";

      // Log a Visit button
      const btnLog = document.createElement("button");
      btnLog.type = "button";
      btnLog.className =
        "py-1.5 px-2.5 bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-2xs";
      btnLog.innerHTML = `<span>Log Visit</span>`;
      btnLog.onclick = () => {
        clearDroppedPin();
        onSelectionRef.current?.(activeVenue, "visit");
      };
      btnContainer.appendChild(btnLog);

      // Want to Try button
      const btnWish = document.createElement("button");
      btnWish.type = "button";
      btnWish.className =
        "py-1.5 px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-2xs";
      btnWish.innerHTML = `<span>Want to Try</span>`;
      btnWish.onclick = () => {
        clearDroppedPin();
        onSelectionRef.current?.(activeVenue, "wishlist");
      };
      btnContainer.appendChild(btnWish);
      popupDiv.appendChild(btnContainer);

      // Nearby places list container inside popover
      const nearbyContainer = document.createElement("div");
      nearbyContainer.className = "pt-2 border-t border-stone-200/80 dark:border-stone-700/80 space-y-1.5";

      const renderNearbyList = (stores: Venue[]) => {
        nearbyContainer.innerHTML = "";
        if (!stores || stores.length === 0) return;
        const header = document.createElement("div");
        header.className = "text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider";
        header.textContent = "Nearby places (tap to select)";
        nearbyContainer.appendChild(header);

        for (const store of stores.slice(0, 3)) {
          const storeBtn = document.createElement("button");
          storeBtn.type = "button";
          storeBtn.className =
            "w-full text-left p-1.5 rounded-lg bg-stone-50 dark:bg-stone-800/80 hover:bg-amber-50 dark:hover:bg-amber-950/60 border border-stone-200/60 dark:border-stone-700/60 flex items-center justify-between gap-1.5 cursor-pointer transition-colors";
          const catSvg = categorySvgs[store.category] ?? categorySvgs.other;
          const distM = haversine(
            { lat: store.location.lat, lng: store.location.lng },
            latlng,
          );
          storeBtn.innerHTML = `
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="w-4 h-4 flex items-center justify-center text-amber-700 dark:text-amber-400 shrink-0">${catSvg}</span>
              <span class="text-xs font-semibold text-stone-800 dark:text-stone-200 truncate">${escapeHtml(store.name)}</span>
            </div>
            <span class="text-[10px] text-stone-400 shrink-0 font-mono">${Math.round(distM)}m</span>
          `;
          storeBtn.onclick = () => {
            const storeLatLng = L.latLng(store.location.lat, store.location.lng);
            if (droppedPinMarkerRef.current) {
              droppedPinMarkerRef.current.setLatLng(storeLatLng);
            }
            Object.assign(activeVenue, store);
            titleEl.textContent = store.name;
            addrEl.textContent =
              store.location.locality || store.location.formattedAddress || "";
            const cName = getCategoryDisplayName(store.category);
            const cSvg = categorySvgs[store.category] ?? categorySvgs.other;
            catBadge.innerHTML = `<span class="w-3 h-3 flex items-center justify-center">${cSvg}</span><span>${cName}</span>`;
            nearbyContainer.innerHTML = "";
            popup.update();
            setActiveDroppedPin({
              venue: store,
              isLoading: false,
              addressLabel: store.location.locality || store.location.formattedAddress || coordinateLabel(store.location),
            });
          };
          nearbyContainer.appendChild(storeBtn);
        }
      };

      if (initialNearbyStores.length > 0) {
        renderNearbyList(initialNearbyStores);
        popupDiv.appendChild(nearbyContainer);
      }

      const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

      const popup = L.popup({
        offset: [0, -28],
        closeButton: true,
        autoClose: true,
        closeOnClick: false,
        autoPan: true,
        autoPanPaddingTopLeft: isMobile ? L.point(20, 100) : L.point(40, 80),
        autoPanPaddingBottomRight: isMobile ? L.point(20, 220) : L.point(60, 50),
        className: "keepcheck-popover",
      })
        .setLatLng(latlng)
        .setContent(popupDiv)
        .openOn(map);

      // Smoothly pan into view with mobile-adjusted padding
      try {
        map.panInside(latlng, {
          paddingTopLeft: isMobile ? [20, 110] : [40, 180],
          paddingBottomRight: isMobile ? [20, 240] : [60, 60],
          animate: true,
          duration: 0.4,
        });
      } catch {
        // Fallback gracefully
      }

      currentPopupRef.current = popup;

      popup.on("remove", () => {
        if (droppedPinMarkerRef.current) {
          droppedPinMarkerRef.current.remove();
          droppedPinMarkerRef.current = null;
        }
      });

      return {
        updateVenue: (
          updated: Venue,
          newTitle?: string,
          newSubtitle?: string,
          updatedNearbyStores?: Venue[],
        ) => {
          Object.assign(activeVenue, updated);
          titleEl.textContent = newTitle || updated.name;
          addrEl.textContent =
            newSubtitle || updated.location.locality || updated.location.formattedAddress;
          const newCatName = getCategoryDisplayName(updated.category);
          const newCatIconSvg = categorySvgs[updated.category] ?? categorySvgs.other;
          catBadge.innerHTML = `<span class="w-3 h-3 flex items-center justify-center">${newCatIconSvg}</span><span>${newCatName}</span>`;

          if (updatedNearbyStores && updatedNearbyStores.length > 0) {
            renderNearbyList(updatedNearbyStores);
            if (!popupDiv.contains(nearbyContainer)) {
              popupDiv.appendChild(nearbyContainer);
            }
          } else {
            nearbyContainer.innerHTML = "";
          }

          popup.update();
        },
      };
    },
    [],
  );

  // Handle Search Result Selection
  const handleSelectSearchResult = useCallback(
    (venue: Venue) => {
      setMapSearchOpen(false);
      setMapSearchQuery("");
      const map = mapRef.current;
      if (!map) return;

      const latlng = L.latLng(venue.location.lat, venue.location.lng);

      // Smoothly fly to location centered in unobstructed viewport
      flyToVenue(venue);

      // If already saved, select in sidebar
      if (venue.record) {
        choose(venue);
        return;
      }

      // Drop visible pin with drop/pulse animation
      renderDroppedPin(latlng);

      // Open floating popover directly above the map pin
      openVenuePopover(venue, latlng);
      setActiveDroppedPin({
        venue,
        isLoading: false,
        addressLabel:
          venue.location.locality ||
          venue.location.formattedAddress ||
          coordinateLabel(venue.location),
      });
    },
    [choose, flyToVenue, openVenuePopover, renderDroppedPin],
  );

  // Initialize Leaflet map with CartoDB Voyager base tiles & maxNativeZoom
  useEffect(() => {
    if (!container.current) return;
    const p = initial.current;
    const map = L.map(container.current, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      maxZoom: 20,
    }).setView(p ? [p.lat, p.lng] : [14.5995, 120.9842], p ? 16 : 13);
    mapRef.current = map;

    // Custom attribution control without Leaflet prefix
    const attributionControl = L.control.attribution({
      prefix: false,
      position: "bottomright",
    });

    const origUpdate = (
      attributionControl as unknown as { _update: () => void }
    )._update.bind(attributionControl);
    (
      attributionControl as unknown as { _update: () => void }
    )._update = function () {
      origUpdate();
      const el = attributionControl.getContainer();
      if (!el) return;
      const html = el.innerHTML;
      if (!el.querySelector(".leaflet-attribution-toggle")) {
        el.innerHTML = `
          <button type="button" class="leaflet-attribution-toggle" aria-label="Toggle map attribution" aria-expanded="false">
            <span class="leaflet-attribution-icon" aria-hidden="true">ⓘ</span>
          </button>
          <span class="leaflet-attribution-content">${html}</span>
        `;
      }
    };

    attributionControl.addTo(map);

    const attrContainer = attributionControl.getContainer();
    let handleAttrClick: ((e: MouseEvent) => void) | undefined;
    let handleOutsideAttrClick: ((e: MouseEvent | TouchEvent) => void) | undefined;

    if (attrContainer) {
      L.DomEvent.disableClickPropagation(attrContainer);
      L.DomEvent.disableScrollPropagation(attrContainer);

      handleAttrClick = (e: MouseEvent) => {
        if ((e.target as HTMLElement).closest("a")) return;
        e.stopPropagation();
        const isExpanded = attrContainer.classList.toggle("is-expanded");
        const toggleBtn = attrContainer.querySelector(".leaflet-attribution-toggle");
        toggleBtn?.setAttribute("aria-expanded", String(isExpanded));
        const icon = attrContainer.querySelector(".leaflet-attribution-icon");
        if (icon) {
          icon.textContent = isExpanded ? "✕" : "ⓘ";
        }
      };

      attrContainer.addEventListener("click", handleAttrClick);

      handleOutsideAttrClick = (e: MouseEvent | TouchEvent) => {
        if (!attrContainer.contains(e.target as Node)) {
          if (attrContainer.classList.contains("is-expanded")) {
            attrContainer.classList.remove("is-expanded");
            attrContainer.querySelector(".leaflet-attribution-toggle")?.setAttribute("aria-expanded", "false");
            const icon = attrContainer.querySelector(".leaflet-attribution-icon");
            if (icon) icon.textContent = "ⓘ";
          }
        }
      };

      document.addEventListener("click", handleOutsideAttrClick);
      document.addEventListener("touchend", handleOutsideAttrClick);
    }

    const cartoKey = (process.env.NEXT_PUBLIC_CARTO_API_KEY || "").trim();
    const voyagerTileUrl = cartoKey
      ? `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${cartoKey}`
      : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

    // CARTO tiles stop at zoom 18; maxNativeZoom: 18 upscale smoothly up to zoom 20
    const tileLayer = L.tileLayer(voyagerTileUrl, {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors &middot; &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>',
      subdomains: "abcd",
      maxNativeZoom: 18,
      maxZoom: 20,
    }).addTo(map);
    tileLayerRef.current = tileLayer;

    // Track zoom level & toggle detailed POI labels (zoom >= 15)
    const updateZoomClass = () => {
      const z = map.getZoom();
      setCurrentZoom(z);
      container.current?.classList.toggle("map-zoom-detailed", z >= 15);
    };
    map.on("zoomend", updateZoomClass);
    updateZoomClass();

    // Track map panning to toggle "Search this area" prompt
    const handleMove = () => {
      if (lastScannedCenterRef.current && map.getZoom() >= 14) {
        const center = map.getCenter();
        const dist = haversine(
          { lat: center.lat, lng: center.lng },
          lastScannedCenterRef.current,
        );
        if (dist > 280) {
          setHasPannedAway(true);
        }
      }
    };
    map.on("move", handleMove);

    // Handle Map Click: Snap to Store within 40m, or lookup real store / street name
    const handleMapClick = async (e: L.LeafletMouseEvent) => {
      // Prevent map clicks from firing right after tapping a marker (e.g. mobile touch bubble)
      if (Date.now() - lastMarkerClickTimeRef.current < 450) {
        return;
      }

      // If user is currently in Pin Adjustment Mode, clicking the map moves the pin
      if (adjustingSpotRef.current) {
        updateAdjustedPosition({ lat: e.latlng.lat, lng: e.latlng.lng });
        return;
      }

      reverse.current?.abort();
      const controller = new AbortController();
      reverse.current = controller;

      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      const clickCoords = { lat, lng };

      // 1. Synchronously check if any cached POI is within 40m
      const nearbyCached = poisRef.current
        .map((v) => ({ venue: v, dist: haversine(clickCoords, v.location) }))
        .filter((item) => item.dist <= 75)
        .sort((a, b) => a.dist - b.dist);

      const closest = nearbyCached[0];
      if (closest && closest.dist <= 40) {
        const store = closest.venue;
        const snapLatLng = L.latLng(store.location.lat, store.location.lng);
        renderDroppedPin(snapLatLng);
        const otherNearby = nearbyCached.slice(1, 4).map((c) => c.venue);
        openVenuePopover(store, snapLatLng, false, otherNearby);
        setActiveDroppedPin({
          venue: store,
          isLoading: false,
          addressLabel:
            store.location.locality ||
            store.location.formattedAddress ||
            coordinateLabel(store.location),
          nearbyStores: otherNearby,
        });
        return;
      }

      // 2. Open popover immediately with "Locating spot…" and drop pin at clicked coordinates
      renderDroppedPin(e.latlng);
      const tempVenue: Venue = {
        key: `pin-${lat.toFixed(5)}-${lng.toFixed(5)}`,
        name: "Locating spot…",
        category: "other",
        location: {
          lat,
          lng,
          formattedAddress: coordinateLabel(clickCoords),
        },
      };
      const popoverHandle = openVenuePopover(tempVenue, e.latlng, true);
      setActiveDroppedPin({
        venue: tempVenue,
        isLoading: true,
        addressLabel: "Resolving address…",
      });

      // 3. Run fast 2500ms lookup (Photon reverse + Overpass around:50 + Nominatim)
      try {
        const resolved = await lookupClickLocation(
          clickCoords,
          poisRef.current,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          const finalVenue: Venue = resolved.snappedVenue ?? {
            key: `pin-${lat.toFixed(5)}-${lng.toFixed(5)}`,
            name: resolved.title,
            category: resolved.category,
            location: resolved.location,
          };
          if (resolved.snappedVenue && droppedPinMarkerRef.current) {
            const storeLatLng = L.latLng(
              resolved.snappedVenue.location.lat,
              resolved.snappedVenue.location.lng,
            );
            droppedPinMarkerRef.current.setLatLng(storeLatLng);
          }
          if (popoverHandle) {
            popoverHandle.updateVenue(
              finalVenue,
              resolved.title,
              resolved.subtitle,
              resolved.nearbyStores,
            );
          }
          setActiveDroppedPin({
            venue: finalVenue,
            isLoading: false,
            addressLabel:
              resolved.subtitle ||
              resolved.location.formattedAddress ||
              coordinateLabel(resolved.location),
            nearbyStores: resolved.nearbyStores,
          });
        }
      } catch {
        // Suppress abort
      }
    };

    map.on("click", handleMapClick);
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(container.current);

    return () => {
      if (attrContainer && handleAttrClick) {
        attrContainer.removeEventListener("click", handleAttrClick);
      }
      if (handleOutsideAttrClick) {
        document.removeEventListener("click", handleOutsideAttrClick);
        document.removeEventListener("touchend", handleOutsideAttrClick);
      }
      reverse.current?.abort();
      resizeObserver.disconnect();
      map.off("zoomend", updateZoomClass);
      map.off("move", handleMove);
      map.off("click", handleMapClick);
      map.remove();
      mapRef.current = null;
    };
  }, [openVenuePopover, renderDroppedPin]);

  // Discover live POIs (zoom >= 14, capped at 40)
  useEffect(() => {
    let isMounted = true;
    const map = mapRef.current;
    if (!map) return;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;

    const performDiscovery = async () => {
      clearTimeout(timer);
      controller?.abort();
      if (!isMounted || !mapRef.current) return;

      try {
        if (!(map as unknown as { _mapPane?: HTMLElement })._mapPane) return;
        if (map.getZoom() < 14) {
          setPois([]);
          setDiscoveryStatus("Zoom in to see nearby spots");
          setIsDiscovering(false);
          return;
        }
      } catch {
        return;
      }

      try {
        if (!(map as unknown as { _mapPane?: HTMLElement })._mapPane) return;
        controller = new AbortController();
        const signal = controller.signal;
        const b = map.getBounds();
        const center = map.getCenter();
        setIsDiscovering(true);
        setDiscoveryStatus(
          online ? "Finding nearby venues…" : "Offline · cached venues only",
        );

        let venues = await discoverVenues(
          discoveryBounds(
            {
              south: b.getSouth(),
              west: b.getWest(),
              north: b.getNorth(),
              east: b.getEast(),
            },
            center,
          ),
          signal,
        );

        // Fallback: if Overpass returned no venues, query Photon nearby
        if ((!venues || venues.length === 0) && online && !signal.aborted) {
          const photonVenues = await searchVenues("cafe", center, signal);
          if (photonVenues && photonVenues.length > 0) {
            venues = photonVenues;
          }
        }

        if (!isMounted || signal.aborted) return;
        if (venues) {
          setPois(venues.slice(0, 40));
          lastScannedCenterRef.current = { lat: center.lat, lng: center.lng };
          setHasPannedAway(false);
        }
        setDiscoveryStatus(
          venues && venues.length > 0
            ? `${Math.min(venues.length, 40)} nearby spots found${online ? "" : " · cached"}`
            : "Nearby spots unavailable",
        );
      } catch {
        // Gracefully suppress tear-down calculation errors when map unmounts
      } finally {
        if (isMounted) {
          setIsDiscovering(false);
        }
      }
    };

    triggerDiscoveryRef.current = performDiscovery;

    const debouncedUpdate = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void performDiscovery();
      }, 600);
    };

    map.on("moveend", debouncedUpdate);
    if ((map as unknown as { _loaded?: boolean })._loaded) {
      debouncedUpdate();
    } else {
      map.whenReady(debouncedUpdate);
    }

    return () => {
      isMounted = false;
      clearTimeout(timer);
      controller?.abort();
      map.off("moveend", debouncedUpdate);
    };
  }, [online]);

  const handleTriggerAreaSearch = () => {
    triggerDiscoveryRef.current();
  };

  // Deduplicate discovered POIs against user's saved spots within ~25 meters
  const filteredDiscoveredPois = useMemo(() => {
    return pois.filter((poi) => {
      const isDuplicateOfSaved = allSpots.some((s) => {
        if (
          s.isDeleted ||
          s.locationMissing ||
          !s.location ||
          !Number.isFinite(s.location.lat) ||
          !Number.isFinite(s.location.lng) ||
          (s.location.lat === 0 && s.location.lng === 0)
        ) {
          return false;
        }
        if (
          poi.location.osmId &&
          s.location.osmId &&
          poi.location.osmId === s.location.osmId
        ) {
          return true;
        }
        return haversine(poi.location, s.location) <= 25;
      });
      return !isDuplicateOfSaved;
    });
  }, [pois, allSpots]);

  // Custom DivIcon Markers Rendering
  const markers = useRef<Map<string, { marker: L.Marker; venue: Venue }>>(new Map());

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !(map as unknown as { _mapPane?: HTMLElement })._mapPane) return;
    let center: L.LatLng;
    try {
      center = map.getCenter();
    } catch {
      return;
    }
    const ids = new Set(
      allSpots.flatMap((s) => (s.location.osmId ? [s.location.osmId] : [])),
    );
    const venues = [...nearestPois(filteredDiscoveredPois, center, ids, 40), ...saved];

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

    venues.forEach((venue, index) => {
      let entry = markers.current.get(venue.key);
      const isSaved = !!venue.record;
      const isWish = venue.record?.status === "wishlist";
      const iconSvg = categorySvgs[venue.category] ?? categorySvgs.other;

      // Nearest 20 discovered venues show store name labels; others show labels on hover
      const showLabel = index < 20;
      const labelClass = showLabel ? "poi-label" : "poi-label-hover";

      let html: string;

      if (isWish) {
        // Want to Try: Distinct bookmark-beak silhouette with warm amber/gold accent (#E5A93C)
        html = `
          <div class="keepcheck-editorial-pin pointer-events-auto select-none" style="position: absolute; bottom: 0; left: 50%; transform: translate(-50%, 0);">
            <div class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#1E1815] text-[#FAF7F2] border-[1.5px] border-[#E5A93C]/60 shadow-[0_4px_12px_rgba(0,0,0,0.35)] transition-all group-hover:scale-105">
              <span class="w-5 h-5 rounded-full bg-[#E5A93C] text-[#1E1815] flex items-center justify-center shrink-0">
                ${bookmarkSvg}
              </span>
              <span class="text-[10px] font-semibold text-amber-100 pr-0.5 tracking-tight">Want to Try</span>
            </div>
            <div class="flex justify-center -mt-[1px]">
              <div class="w-0 h-0 border-x-[4px] border-x-transparent border-t-[5px] border-t-[#1E1815]"></div>
            </div>
          </div>
        `;
      } else if (isSaved) {
        // Visited: Sleek pointer-tip pill tag anchored at bottom tip, #1E1815 with #D95D24 accent badge, 1.5px hairline border, gap-1.5, tabular-nums rating
        const rating = venue.record?.overallRating;
        html = `
          <div class="keepcheck-editorial-pin pointer-events-auto select-none" style="position: absolute; bottom: 0; left: 50%; transform: translate(-50%, 0);">
            <div class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#1E1815] text-[#FAF7F2] border-[1.5px] border-[#FAF7F2]/35 shadow-[0_4px_12px_rgba(0,0,0,0.35)] transition-all group-hover:scale-105">
              <span class="w-5 h-5 rounded-full bg-[#D95D24] text-white flex items-center justify-center shrink-0">
                ${iconSvg}
              </span>
              ${
                rating
                  ? `<span class="text-[11px] font-mono tabular-nums font-bold text-amber-200 pr-0.5">${rating.toFixed(1)}</span>`
                  : `<span class="text-[10px] font-medium text-stone-300 pr-0.5">Visited</span>`
              }
            </div>
            <div class="flex justify-center -mt-[1px]">
              <div class="w-0 h-0 border-x-[4px] border-x-transparent border-t-[5px] border-t-[#1E1815]"></div>
            </div>
          </div>
        `;
      } else {
        // Discovered Nearby POI: Translucent frosted-espresso micro-pins with clean category icon and venue name pill
        html = `
          <div class="keepcheck-editorial-pin keepcheck-poi-inner pointer-events-auto cursor-pointer select-none flex flex-col items-center" style="position: absolute; bottom: 0; left: 50%; transform: translate(-50%, 0);">
            <div class="pointer-events-auto flex flex-col items-center group">
              <div class="w-6.5 h-6.5 rounded-full bg-[#1E1815]/85 backdrop-blur-md text-stone-200 flex items-center justify-center shadow-xs border border-white/20 transition-all group-hover:scale-115 group-hover:border-amber-500 group-hover:text-amber-400">
                ${iconSvg}
              </div>
              <div class="flex justify-center -mt-[0.5px]">
                <div class="w-0 h-0 border-x-[3px] border-x-transparent border-t-[4px] border-t-[#1E1815]/85"></div>
              </div>
            </div>
            <span class="${labelClass} pointer-events-none select-none mt-1 px-1.5 py-0.5 max-w-[110px] truncate text-[10px] font-medium leading-none text-stone-200 bg-[#1E1815]/90 backdrop-blur-xs rounded shadow-xs border border-white/15 text-center">
              ${escapeHtml(venue.name)}
            </span>
          </div>
        `;
      }

      const markerClass = isSaved
        ? "keepcheck-marker keepcheck-saved-marker cursor-pointer"
        : "keepcheck-marker keepcheck-poi-marker cursor-pointer";
      const iconSize: [number, number] = [44, 44];
      const iconAnchor: [number, number] = [22, 44];

      if (!entry) {
        const marker = L.marker([venue.location.lat, venue.location.lng], {
          icon: L.divIcon({
            html,
            className: markerClass,
            iconSize,
            iconAnchor,
          }),
          bubblingMouseEvents: false,
          title: venue.name,
          keyboard: true,
        }).addTo(map);

        entry = { marker, venue };
        markers.current.set(venue.key, entry);
        const cur = entry;

        marker.on("click", (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          lastMarkerClickTimeRef.current = Date.now();
          clearDroppedPin();
          // If venue is saved, choose it in sidebar
          if (cur.venue.record) {
            choose(cur.venue);
          } else {
            // For discovered POI, smoothly pan and open floating popover right on the map!
            const targetLatLng = L.latLng(
              cur.venue.location.lat,
              cur.venue.location.lng,
            );
            map.panTo(targetLatLng, { animate: true, duration: 0.4 });
            openVenuePopover(cur.venue, targetLatLng);
            setActiveDroppedPin({
              venue: cur.venue,
              isLoading: false,
              addressLabel:
                cur.venue.location.locality ||
                cur.venue.location.formattedAddress ||
                coordinateLabel(cur.venue.location),
            });
          }
        });
      } else {
        entry.venue = venue;
        const old = entry.marker.getLatLng();
        if (old.lat !== venue.location.lat || old.lng !== venue.location.lng)
          entry.marker.setLatLng([venue.location.lat, venue.location.lng]);

        entry.marker.setIcon(
          L.divIcon({
            html,
            className: markerClass,
            iconSize,
            iconAnchor,
          }),
        );
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
    });
  }, [
    filteredDiscoveredPois,
    saved,
    selected,
    choose,
    allSpots,
    openVenuePopover,
  ]);

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
      style: { color: "#D97706", weight: 5, opacity: 0.85 },
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
    onSelectionRef.current?.(null);
    setShowRoute(false);
  }, []);

  function handleLocateMe() {
    if (gps.includes("denied")) {
      showToast("Turn on location in your browser to see spots near you", "info");
      return;
    }
    const pos = rawPosition.current;
    if (pos && mapRef.current) {
      mapRef.current.flyTo([pos.lat, pos.lng], 17, { duration: 1.2 });
    } else {
      showToast("Finding your current location…", "info");
    }
  }

  // Sorted discovered venues for the interactive bottom-right drawer
  const sortedPois = useMemo(() => {
    const center = mapRef.current?.getCenter() ?? rawPosition.current;
    if (!center) return filteredDiscoveredPois;
    return [...filteredDiscoveredPois].sort(
      (a, b) => haversine(center, a.location) - haversine(center, b.location),
    );
  }, [filteredDiscoveredPois, rawPosition]);

  return (
    <div className="relative h-full w-full min-h-0 overflow-hidden bg-[#FAF7F2] dark:bg-[#15110F]">
      {/* Full-bleed Leaflet Map Canvas */}
      <div
        ref={container}
        className="absolute inset-0 z-0"
        aria-label="Interactive venue discovery map"
      />

      {/* Floating Map Search Bar & "Search This Area" Discovery at Top-Center */}
      <div
        ref={mapSearchContainerRef}
        className="absolute top-3.5 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-1.75rem)] max-w-md pointer-events-none flex flex-col items-center gap-1.5"
      >
        {/* Search Bar Input */}
        <div className="pointer-events-auto relative w-full shadow-md rounded-2xl bg-white/95 dark:bg-[#1E1815]/95 backdrop-blur-md border border-stone-200/90 dark:border-stone-800 transition-all focus-within:ring-2 focus-within:ring-amber-600/30 focus-within:border-amber-600">
          <div className="relative flex items-center h-10 px-3">
            <Search className="w-4 h-4 text-stone-400 dark:text-stone-400 shrink-0 pointer-events-none mr-2.5" />
            <input
              type="text"
              aria-label="Search cafés, restaurants, or streets to pin"
              placeholder="Search cafés, restaurants, or streets to pin…"
              value={mapSearchQuery}
              onChange={(e) => setMapSearchQuery(e.target.value)}
              onFocus={() => {
                if (mapSearchResults.length > 0) setMapSearchOpen(true);
              }}
              className="w-full bg-transparent text-xs sm:text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-400 outline-none"
            />
            {isSearchingPhoton && (
              <Loader2 className="w-4 h-4 text-amber-700 dark:text-amber-500 animate-spin shrink-0 ml-1.5" />
            )}
            {mapSearchQuery.length > 0 && !isSearchingPhoton && (
              <button
                type="button"
                onClick={() => {
                  setMapSearchQuery("");
                  setMapSearchResults([]);
                  setMapSearchOpen(false);
                }}
                className="p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 rounded-full cursor-pointer ml-1"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Search Autocomplete Dropdown */}
          {mapSearchOpen && mapSearchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 max-h-64 overflow-y-auto bg-white/98 dark:bg-[#1C1612]/98 backdrop-blur-md border border-stone-200/90 dark:border-stone-800 rounded-2xl shadow-xl divide-y divide-stone-100 dark:divide-stone-800/60 z-50">
              <div className="px-3 py-1.5 bg-stone-50/80 dark:bg-stone-900/60 text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
                Nearby & Saved Places (Tap to Pin)
              </div>
              {mapSearchResults.slice(0, 6).map((place) => (
                <button
                  key={place.key}
                  type="button"
                  onClick={() => handleSelectSearchResult(place)}
                  className="w-full p-2.5 text-left hover:bg-amber-50/60 dark:hover:bg-stone-800/60 flex items-start gap-2.5 transition-colors cursor-pointer group"
                >
                  <div className="w-6 h-6 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-amber-100 dark:group-hover:bg-amber-950 group-hover:text-amber-800 dark:group-hover:text-amber-300 transition-colors">
                    {place.record ? (
                      place.record.status === "wishlist" ? (
                        <Bookmark className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      ) : (
                        <Star className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 fill-amber-600" />
                      )
                    ) : (
                      <Compass className="w-3.5 h-3.5 text-amber-700 dark:text-amber-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">
                        {place.name}
                      </p>
                      {place.record && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 shrink-0">
                          Saved
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                      {place.location.locality || place.location.formattedAddress}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Area Discovery Pill Button */}
        <div className="pointer-events-auto flex items-center justify-center">
          {currentZoom < 14 ? (
            <button
              type="button"
              onClick={() => {
                const map = mapRef.current;
                if (map) map.flyTo(map.getCenter(), 15, { duration: 0.8 });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/95 dark:bg-[#1E1815]/95 hover:bg-amber-50 dark:hover:bg-[#28201B] text-stone-700 dark:text-stone-200 hover:text-amber-800 dark:hover:text-amber-400 text-xs font-bold rounded-full shadow-md border border-stone-200/90 dark:border-stone-700 transition-all cursor-pointer active:scale-95"
            >
              <Compass className="w-3.5 h-3.5 text-amber-700 dark:text-amber-500 shrink-0" />
              <span>Zoom in to see nearby spots</span>
            </button>
          ) : isDiscovering ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/95 dark:bg-[#1E1815]/95 text-stone-700 dark:text-stone-200 text-xs font-semibold rounded-full shadow-md border border-stone-200/90 dark:border-stone-700">
              <Loader2 className="w-3.5 h-3.5 text-amber-700 dark:text-amber-500 animate-spin shrink-0" />
              <span>Finding nearby venues…</span>
            </div>
          ) : hasPannedAway ? (
            <button
              type="button"
              onClick={handleTriggerAreaSearch}
              className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-full shadow-md transition-all cursor-pointer active:scale-95 animate-pulse"
            >
              <RefreshCw className="w-3.5 h-3.5 shrink-0" />
              <span>Search this area</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setNearbyDrawerOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/90 dark:bg-[#1E1815]/90 hover:bg-stone-50 dark:hover:bg-[#28201B] text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white text-xs font-medium rounded-full shadow-xs border border-stone-200/80 dark:border-stone-700 transition-all cursor-pointer active:scale-95"
            >
              <Compass className="w-3.5 h-3.5 text-amber-700 dark:text-amber-500 shrink-0" />
              <span>{discoveryStatus}</span>
            </button>
          )}
        </div>
      </div>

      {/* When NOT in split-pane mode (e.g. mobile standalone view), render mobile floating panels */}
      {!splitPaneMode && (
        <div className="map-panel pointer-events-none absolute inset-3 z-20 flex flex-col justify-between">
          <div className="pointer-events-auto bg-white/95 dark:bg-[#1E1815]/95 rounded-2xl p-3 shadow-md border border-stone-200 dark:border-stone-800 space-y-2">
            {navigation}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={mapSearchQuery}
                onChange={(e) => setMapSearchQuery(e.target.value)}
                placeholder="Search venues…"
                className="flex-1 h-9 px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs text-stone-900 dark:text-stone-100 outline-none focus:border-amber-600"
              />
              {filters}
            </div>
            {statusTabs}
          </div>

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
                onAdjustPin={(s) => setInternalAdjustingSpot(s)}
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

      {/* Floating Interactive Nearby Spots Drawer (Bottom-Right / Mobile Bottom Sheet) */}
      {nearbyDrawerOpen && (
        <div
          ref={nearbyDrawerRef}
          className="absolute left-3.5 right-3.5 bottom-4 sm:bottom-20 sm:left-auto sm:right-3.5 z-40 sm:w-80 max-h-[55dvh] sm:max-h-96 bg-white/98 dark:bg-[#1E1815]/98 backdrop-blur-md rounded-2xl shadow-2xl border border-stone-200/90 dark:border-stone-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Drawer Header */}
          <div className="p-3 bg-stone-50/80 dark:bg-stone-900/60 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <Compass className="w-4 h-4 text-amber-700 dark:text-amber-500 shrink-0" />
              <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                Nearby Spots in View
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 font-bold">
                {sortedPois.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setNearbyDrawerOpen(false)}
              className="p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 rounded-lg cursor-pointer"
              aria-label="Close nearby places drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable Venue List */}
          <div className="overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800/60 p-1 flex-1">
            {sortedPois.length === 0 ? (
              <div className="p-6 text-center text-xs text-stone-400">
                No food & drink venues found in this area. Zoom in or explore another street!
              </div>
            ) : (
              sortedPois.map((venue) => {
                const center = mapRef.current?.getCenter() ?? rawPosition.current;
                const dist = center ? haversine(center, venue.location) : 0;
                const catName = getCategoryDisplayName(venue.category);
                return (
                  <button
                    key={venue.key}
                    type="button"
                    onClick={() => {
                      setNearbyDrawerOpen(false);
                      const storeLatLng = L.latLng(
                        venue.location.lat,
                        venue.location.lng,
                      );
                      flyToVenue(venue);
                      renderDroppedPin(storeLatLng);
                      openVenuePopover(venue, storeLatLng);
                    }}
                    className="w-full p-2.5 text-left hover:bg-amber-50/60 dark:hover:bg-stone-800/60 rounded-xl flex items-start gap-2.5 transition-colors cursor-pointer group"
                  >
                    <div className="w-7 h-7 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-amber-100 dark:group-hover:bg-amber-950 group-hover:text-amber-800 dark:group-hover:text-amber-300 transition-colors">
                      <span
                        dangerouslySetInnerHTML={{
                          __html: categorySvgs[venue.category] ?? categorySvgs.other,
                        }}
                        className="w-3.5 h-3.5 flex items-center justify-center"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">
                          {venue.name}
                        </p>
                        <span className="text-[10px] font-mono text-amber-700 dark:text-amber-400 shrink-0 font-medium">
                          {formatDistance(dist)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] px-1 py-0.2 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                          {catName}
                        </span>
                        <p className="text-[11px] text-stone-400 truncate">
                          {venue.location.locality || venue.location.formattedAddress}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Bottom-Right Floating Map Controls */}
      <div className="absolute right-3.5 bottom-6 z-20 flex flex-col items-end gap-2">
        {/* Interactive "X spots nearby" Glassmorphic Floating Pill */}
        {filteredDiscoveredPois.length > 0 && (
          <button
            ref={nearbyButtonRef}
            type="button"
            onClick={() => setNearbyDrawerOpen((prev) => !prev)}
            aria-label={`${filteredDiscoveredPois.length} spots nearby. Tap to view list.`}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#1E1815]/90 backdrop-blur-md hover:bg-[#28201B] text-[#FAF7F2] text-xs font-bold rounded-full shadow-lg border border-white/15 transition-all cursor-pointer active:scale-95 group"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#D95D24] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#D95D24]" />
            </span>
            <span className="font-sans tracking-wide">{filteredDiscoveredPois.length} spots nearby</span>
            <ChevronUp
              className={`w-3.5 h-3.5 text-stone-400 group-hover:text-amber-400 transition-transform duration-200 ${
                nearbyDrawerOpen ? "rotate-180" : ""
              }`}
            />
          </button>
        )}

        {/* Locate Me */}
        <button
          type="button"
          onClick={handleLocateMe}
          aria-label="Locate me on map"
          className="w-11 h-11 bg-white dark:bg-[#1E1815] hover:bg-stone-50 dark:hover:bg-[#28201B] text-stone-700 dark:text-stone-300 active:text-amber-700 dark:active:text-amber-500 rounded-xl shadow-md border border-stone-200/90 dark:border-stone-700 flex items-center justify-center transition-all cursor-pointer active:scale-95"
          title="Locate me"
        >
          <Navigation className="w-5 h-5 text-amber-700 dark:text-amber-500" />
        </button>

        {/* Zoom In & Out Controls */}
        <div className="bg-white dark:bg-[#1E1815] rounded-xl shadow-md border border-stone-200/90 dark:border-stone-700 overflow-hidden flex flex-col">
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn()}
            aria-label="Zoom in"
            className="w-11 h-10 hover:bg-stone-50 dark:hover:bg-[#28201B] text-stone-700 dark:text-stone-300 flex items-center justify-center border-b border-stone-100 dark:border-stone-800 transition-colors cursor-pointer active:scale-95"
          >
            <Plus className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut()}
            aria-label="Zoom out"
            className="w-11 h-10 hover:bg-stone-50 dark:hover:bg-[#28201B] text-stone-700 dark:text-stone-300 flex items-center justify-center transition-colors cursor-pointer active:scale-95"
          >
            <Minus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Active Pin Placement Mode Bar */}
      {activeAdjustingSpot && adjustedCoords && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1.75rem)] max-w-lg bg-white/98 dark:bg-[#1E1815]/98 backdrop-blur-md border border-amber-300 dark:border-amber-800 rounded-2xl shadow-2xl p-3.5 flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-600 animate-pulse" />
                <h4 className="font-serif font-bold text-sm text-stone-900 dark:text-white truncate">
                  Adjusting Pin for &ldquo;{activeAdjustingSpot.name}&rdquo;
                </h4>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400 truncate mt-0.5">
                {isResolvingAdjustedAddress ? (
                  <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Resolving address…</span>
                  </span>
                ) : (
                  adjustedAddress || `${adjustedCoords.lat.toFixed(5)}, ${adjustedCoords.lng.toFixed(5)}`
                )}
              </p>
            </div>
          </div>

          <p className="text-[11px] text-stone-600 dark:text-stone-300">
            Tap anywhere on the map or drag the pin to set the exact storefront entrance.
          </p>

          <div className="flex items-center justify-end gap-2 pt-1 border-t border-stone-200/80 dark:border-stone-800">
            <button
              type="button"
              onClick={handleCancelAdjustPin}
              className="px-3.5 py-1.5 text-xs font-semibold text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmAdjustPin}
              className="px-4 py-1.5 bg-amber-700 hover:bg-amber-800 active:bg-amber-900 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Confirm Pin Location</span>
            </button>
          </div>
        </div>
      )}

      {/* Floating Bottom Action Card for Dropped / Unsaved Pin */}
      {activeDroppedPin && !activeAdjustingSpot && (
        <div className="absolute left-3.5 right-3.5 bottom-16 sm:bottom-6 sm:left-auto sm:right-3.5 z-40 sm:w-96 bg-white/98 dark:bg-[#1E1815]/98 backdrop-blur-md rounded-2xl shadow-2xl border border-stone-200/90 dark:border-stone-800 p-3.5 flex flex-col gap-2.5 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/70 flex items-center justify-center shrink-0 mt-0.5">
                <span
                  dangerouslySetInnerHTML={{
                    __html: categorySvgs[activeDroppedPin.venue.category] ?? categorySvgs.other,
                  }}
                  className="w-4 h-4 flex items-center justify-center"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300">
                    {getCategoryDisplayName(activeDroppedPin.venue.category)}
                  </span>
                  {(() => {
                    const hours = getOpeningHoursStatus(activeDroppedPin.venue.openingHours);
                    if (!hours) return null;
                    return hours === "open" ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Open now
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-stone-400" />
                        Closed
                      </span>
                    );
                  })()}
                </div>
                <h4 className="font-serif font-bold text-sm text-stone-900 dark:text-white truncate mt-0.5">
                  {activeDroppedPin.isLoading ? (
                    <span className="inline-flex items-center gap-1.5 text-stone-500 dark:text-stone-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Locating spot…
                    </span>
                  ) : (
                    activeDroppedPin.venue.name
                  )}
                </h4>
                <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate mt-0.5">
                  {activeDroppedPin.isLoading
                    ? "Resolving address…"
                    : activeDroppedPin.addressLabel}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={clearDroppedPin}
              className="w-8 h-8 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
              aria-label="Clear pin"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-stone-200/80 dark:border-stone-800">
            <button
              type="button"
              onClick={() => {
                const venueToLog = activeDroppedPin.venue;
                clearDroppedPin();
                onSelectionRef.current?.(venueToLog, "visit");
              }}
              className="min-h-[44px] px-3 py-2 bg-amber-700 hover:bg-amber-800 active:bg-amber-900 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Log This Spot</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const venueToWish = activeDroppedPin.venue;
                clearDroppedPin();
                onSelectionRef.current?.(venueToWish, "wishlist");
              }}
              className="min-h-[44px] px-3 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Bookmark className="w-4 h-4" />
              <span>Want to Try</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
