"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Locate, Navigation } from "lucide-react";

interface LocationPickerMapProps {
  initialLat?: number;
  initialLng?: number;
  onLocationSelected: (coords: { latitude: number; longitude: number }) => void;
}

const createPickerPinIcon = () => {
  const htmlContent = `
    <div style="
      display: flex;
      align-items: center;
      justify-content: center;
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background-color: var(--accent, #e11d48);
      border: 3px solid white;
      box-shadow: 0 6px 14px rgba(0, 0, 0, 0.35);
      color: white;
      position: relative;
    ">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-10a8 8 0 0 1 16 0Z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
      <div style="
        position: absolute;
        bottom: -7px;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 7px solid var(--accent, #e11d48);
      "></div>
    </div>
  `;

  return L.divIcon({
    html: htmlContent,
    className: "location-picker-marker",
    iconSize: [38, 45],
    iconAnchor: [19, 45],
  });
};

export default function LocationPickerMap({
  initialLat,
  initialLng,
  onLocationSelected,
}: LocationPickerMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [currentCoords, setCurrentCoords] = useState<{ latitude: number; longitude: number } | null>(
    initialLat !== undefined && initialLng !== undefined
      ? { latitude: initialLat, longitude: initialLng }
      : null
  );

  const [locating, setLocating] = useState(false);

  // Update marker position & fire callback
  const setPin = useCallback(
    (lat: number, lng: number) => {
      const roundedLat = Number(lat.toFixed(6));
      const roundedLng = Number(lng.toFixed(6));

      setCurrentCoords({ latitude: roundedLat, longitude: roundedLng });
      onLocationSelected({ latitude: roundedLat, longitude: roundedLng });

      if (mapRef.current) {
        if (!markerRef.current) {
          const marker = L.marker([lat, lng], {
            icon: createPickerPinIcon(),
            draggable: true,
          }).addTo(mapRef.current);

          marker.on("dragend", () => {
            const pos = marker.getLatLng();
            const rLat = Number(pos.lat.toFixed(6));
            const rLng = Number(pos.lng.toFixed(6));
            setCurrentCoords({ latitude: rLat, longitude: rLng });
            onLocationSelected({ latitude: rLat, longitude: rLng });
          });

          markerRef.current = marker;
        } else {
          markerRef.current.setLatLng([lat, lng]);
        }
      }
    },
    [onLocationSelected]
  );

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Default starting center (if no initial coords, start at Manila center or 14.5995, 120.9842)
    const defaultLat = initialLat ?? 14.5995;
    const defaultLng = initialLng ?? 120.9842;
    const zoom = initialLat && initialLng ? 16 : 13;

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
    }).setView([defaultLat, defaultLng], zoom);

    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    if (initialLat !== undefined && initialLng !== undefined) {
      setPin(initialLat, initialLng);
    } else {
      // Try auto-locating on map load if no initial location
      if (navigator.geolocation) {
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setLocating(false);
            const { latitude, longitude } = pos.coords;
            map.setView([latitude, longitude], 15);
            setPin(latitude, longitude);
          },
          () => {
            setLocating(false);
          },
          { enableHighAccuracy: false, timeout: 4000 }
        );
      }
    }

    // Map click handler to move/set pin
    map.on("click", (e: L.LeafletMouseEvent) => {
      setPin(e.latlng.lat, e.latlng.lng);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Button handler to center map on GPS position
  const handleLocateUser = () => {
    if (!navigator.geolocation) return;

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        if (mapRef.current) {
          mapRef.current.flyTo([latitude, longitude], 16, { duration: 1 });
        }
        setPin(latitude, longitude);
      },
      (err) => {
        setLocating(false);
        alert("Could not access your location. Please tap directly on the map to set a pin.");
      },
      { enableHighAccuracy: false, timeout: 5000 }
    );
  };

  return (
    <div className="relative w-full h-full min-h-[350px] sm:min-h-[420px] rounded-2xl overflow-hidden border border-text-secondary/15 shadow-neu-inset">
      {/* Map Element */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[350px] sm:min-h-[420px]" />

      {/* Floating GPS Button */}
      <button
        type="button"
        onClick={handleLocateUser}
        disabled={locating}
        className="absolute top-3 right-3 z-[400] neu-button bg-bg/90 backdrop-blur-md p-2.5 rounded-xl text-text-primary shadow-neu-subtle hover:text-accent flex items-center gap-2 text-xs font-semibold cursor-pointer active:scale-95 transition-all"
        title="Locate me"
      >
        <Locate className={`h-4 w-4 text-accent ${locating ? "animate-spin" : ""}`} />
        <span className="hidden sm:inline">{locating ? "Locating…" : "My Location"}</span>
      </button>

      {/* Pin Status Banner */}
      <div className="absolute bottom-3 left-3 right-3 z-[400] bg-bg/95 backdrop-blur-md px-3.5 py-2.5 rounded-xl border border-text-secondary/15 shadow-neu-raised flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 truncate">
          <Navigation className="h-4 w-4 text-accent shrink-0" />
          <span className="font-mono text-text-primary font-medium truncate">
            {currentCoords
              ? `${currentCoords.latitude.toFixed(5)}, ${currentCoords.longitude.toFixed(5)}`
              : "Tap map to set pin"}
          </span>
        </div>
        <span className="text-[10px] text-text-secondary font-sans ml-2 shrink-0">
          {currentCoords ? "✓ Pin placed" : "Click anywhere"}
        </span>
      </div>
    </div>
  );
}
