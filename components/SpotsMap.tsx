"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { FoodSpotLog } from "@/app/db";

interface SpotsMapProps {
  spots: FoodSpotLog[];
}

const createCustomIcon = (spot: FoodSpotLog) => {
  const categoryColor = spot.category === "Cafe" ? "var(--category-cafe)" : "var(--category-restaurant)";
  
  const htmlContent = `
    <div style="
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background-color: ${categoryColor};
      border: 2px solid white;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15), var(--neu-shadow-subtle);
      color: white;
      font-family: var(--font-space-mono), monospace;
      font-weight: bold;
      font-size: 11px;
      position: relative;
    ">
      ${spot.rating}
      <div style="
        position: absolute;
        bottom: -6px;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-top: 6px solid ${categoryColor};
      "></div>
    </div>
  `;

  return L.divIcon({
    html: htmlContent,
    className: "custom-leaflet-marker",
    iconSize: [32, 38],
    iconAnchor: [16, 38],
    popupAnchor: [0, -38]
  });
};

export default function SpotsMap({ spots }: SpotsMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize map
    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
    });
    mapRef.current = map;

    // Add TileLayer with OpenStreetMap (OSM)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Filter spots with coordinates
    const validSpots = spots.filter(
      (s) => s.latitude !== undefined && s.longitude !== undefined
    ) as (FoodSpotLog & { latitude: number; longitude: number })[];

    const markers: L.Marker[] = [];

    validSpots.forEach((spot) => {
      const popupContent = `
        <div style="display: flex; flex-direction: column; gap: 8px; width: 140px; font-family: var(--font-work-sans), sans-serif; padding: 2px;">
          ${
            spot.thumbnail
              ? `<div style="width: 100%; height: 80px; overflow: hidden; border-radius: 8px;">
                   <img src="${spot.thumbnail}" alt="${spot.name}" style="width: 100%; height: 100%; object-fit: cover;" />
                 </div>`
              : `<div style="width: 100%; height: 48px; background: rgba(0,0,0,0.05); display: flex; align-items: center; justify-content: center; font-size: 24px; border-radius: 8px;">
                   ${spot.category === "Cafe" ? "☕" : "🍽️"}
                 </div>`
          }
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <h3 style="font-family: var(--font-fraunces), Georgia, serif; font-weight: bold; font-size: 14px; margin: 0; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${spot.name}</h3>
            <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
              <span style="font-family: var(--font-space-mono), monospace; font-size: 10px; font-weight: bold; color: var(--accent); background: rgba(107, 93, 79, 0.05); padding: 2px 6px; border-radius: 4px;">${spot.rating} / 10</span>
              <span style="font-size: 9px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">${spot.category}</span>
            </div>
          </div>
        </div>
      `;

      const marker = L.marker([spot.latitude, spot.longitude], {
        icon: createCustomIcon(spot),
      })
        .bindPopup(popupContent, {
          maxWidth: 200,
          minWidth: 140,
        })
        .addTo(map);

      markers.push(marker);
    });

    // Fit bounds or center
    if (validSpots.length > 0) {
      if (validSpots.length === 1) {
        map.setView([validSpots[0].latitude, validSpots[0].longitude], 15);
      } else {
        const bounds = L.latLngBounds(validSpots.map((s) => [s.latitude, s.longitude]));
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    } else {
      map.setView([0, 0], 2);
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [spots]);

  return (
    <div
      ref={mapContainerRef}
      className="w-full h-full rounded-2xl overflow-hidden shadow-neu-inset border border-text-secondary/10"
      style={{ minHeight: "450px" }}
    />
  );
}
