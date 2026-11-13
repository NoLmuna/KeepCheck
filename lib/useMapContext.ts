"use client";
import { useEffect, useState } from "react";
import type { Coordinates } from "./geo";
export function useMapContext() {
  const [online, setOnline] = useState(true);
  const [position, setPosition] = useState<
    (Coordinates & { accuracy: number }) | null
  >(null);
  const [gps, setGps] = useState("GPS locating…");
  useEffect(() => {
    const status = () => setOnline(navigator.onLine);
    status();
    window.addEventListener("online", status);
    window.addEventListener("offline", status);
    let active = true;
    const watch = navigator.geolocation?.watchPosition(
      (p) => {
        if (!active) return;
        setPosition({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
        });
        setGps(`GPS ±${Math.round(p.coords.accuracy)} m`);
      },
      (e) => {
        if (active) {
          setPosition(null);
          setGps(e.code === 1 ? "GPS permission denied" : "GPS unavailable");
        }
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 15000 },
    );
    // Browser capability is only available after mounting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!navigator.geolocation) setGps("GPS unsupported");
    return () => {
      active = false;
      if (watch !== undefined) navigator.geolocation.clearWatch(watch);
      window.removeEventListener("online", status);
      window.removeEventListener("offline", status);
    };
  }, []);
  return { online, position, gps };
}
