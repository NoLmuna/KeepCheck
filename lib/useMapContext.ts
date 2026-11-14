"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Coordinates } from "./geo";
import { shouldCommitPosition } from "./mapPerformance";
export type UserPosition = Coordinates & { accuracy: number };
export function useMapContext() {
  const rawPosition = useRef<UserPosition | null>(null);
  const listeners = useRef(new Set<(position: UserPosition | null) => void>());
  const subscribePosition = useCallback(
    (listener: (position: UserPosition | null) => void) => {
      listeners.current.add(listener);
      listener(rawPosition.current);
      return () => {
        listeners.current.delete(listener);
      };
    },
    [],
  );
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
    let lastPosition: UserPosition | null = null;
    let lastCommit = 0;
    const watch = navigator.geolocation?.watchPosition(
      (p) => {
        if (!active) return;
        const next = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
        };
        rawPosition.current = next;
        listeners.current.forEach((listener) => listener(next));
        const now = performance.now();
        if (shouldCommitPosition(lastPosition, next, now - lastCommit)) {
          lastPosition = next;
          lastCommit = now;
          setPosition(next);
          setGps(`GPS ±${Math.round(next.accuracy)} m`);
        }
      },
      (e) => {
        if (active) {
          rawPosition.current = null;
          lastPosition = null;
          listeners.current.forEach((listener) => listener(null));
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
  return useMemo(
    () => ({ online, position, gps, rawPosition, subscribePosition }),
    [online, position, gps, subscribePosition],
  );
}
