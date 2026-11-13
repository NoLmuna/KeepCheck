"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import type { SpotLocation } from "@/app/db";
import { reverseLocation } from "@/lib/osm";
import { X, MapPin, Check } from "lucide-react";

const LocationPickerMap = dynamic(() => import("./LocationPickerMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[350px] sm:h-[420px] rounded-2xl neu-raised bg-bg/40 flex flex-col items-center justify-center gap-3 text-text-secondary text-sm font-mono animate-pulse">
      <MapPin className="h-8 w-8 text-accent/60" />
      <span>Loading Interactive Map…</span>
    </div>
  ),
});

interface LocationPickerModalProps {
  initialLat?: number;
  initialLng?: number;
  onConfirm: (coords: { latitude: number; longitude: number; location?: SpotLocation }) => void;
  onClose: () => void;
}

export default function LocationPickerModal({
  initialLat,
  initialLng,
  onConfirm,
  onClose,
}: LocationPickerModalProps) {
  const [selectedCoords, setSelectedCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(
    initialLat !== undefined && initialLng !== undefined
      ? { latitude: initialLat, longitude: initialLng }
      : null
  );

  const [resolved, setResolved] = useState<SpotLocation | null>(null);
  useEffect(() => {
    setResolved(null);
    if (!selectedCoords) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void reverseLocation({ lat: selectedCoords.latitude, lng: selectedCoords.longitude }, controller.signal).then(location => {
        if (!controller.signal.aborted) setResolved(location);
      });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [selectedCoords]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Pin spot location on map"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative z-10 w-full max-w-2xl bg-bg rounded-3xl p-4 sm:p-6 border border-text-secondary/15 shadow-neu-raised flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-text-secondary/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-accent/10 text-accent">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-serif font-bold text-text-primary">
                Pin Location on Map
              </h3>
              <p className="text-xs text-text-secondary">
                Tap anywhere on the map or drag the pin to set the exact spot position.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="neu-button flex h-9 w-9 items-center justify-center rounded-full text-text-secondary cursor-pointer hover:text-red-500 shrink-0"
            aria-label="Close location picker"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Map Container */}
        <div className="flex-1 w-full overflow-hidden my-1">
          <LocationPickerMap
            initialLat={initialLat}
            initialLng={initialLng}
            onLocationSelected={(coords) => setSelectedCoords(coords)}
          />
        </div>

        {/* Footer Actions */}
        <div className="pt-4 mt-2 border-t border-text-secondary/10 flex items-center justify-between gap-3">
          <div className="text-xs font-mono text-text-secondary truncate hidden sm:block">
            {selectedCoords
              ? resolved?.formattedAddress || `📍 ${selectedCoords.latitude.toFixed(5)}, ${selectedCoords.longitude.toFixed(5)}`
              : "No pin selected"}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="neu-button rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold text-text-secondary hover:text-text-primary cursor-pointer flex-1 sm:flex-initial"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selectedCoords}
              onClick={() => {
                if (selectedCoords) {
                  onConfirm({ ...selectedCoords, ...(resolved ? { location: resolved } : {}) });
                  onClose();
                }
              }}
              className="neu-button rounded-xl px-5 py-2.5 text-xs sm:text-sm font-bold bg-gold text-[#4E342E] hover:bg-gold/90 disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5 flex-1 sm:flex-initial shadow-neu-button"
            >
              <Check className="h-4 w-4" />
              <span>Confirm Location</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
