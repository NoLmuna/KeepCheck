"use client";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import dynamic from "next/dynamic";
import Link from "next/link";
import { db } from "@/app/db";
import { useAuth } from "@/lib/auth";
import { useMapContext } from "@/lib/useMapContext";
import { useJournalSync } from "@/lib/useJournalSync";
import {
  filterSpots,
  defaultFilters,
  saveJournalEntry,
  type Filters,
} from "@/lib/journal";
import { journalVenue, haversine, type Venue } from "@/lib/geo";
import VenueSheet, { type SaveVenue } from "./VenueSheet";
import JournalFilters, { StatusTabs } from "./JournalFilters";
const JournalTools = dynamic(() => import("./JournalTools"), { ssr: false });
import SpotCard from "./SpotCard";
import type { Spot } from "@/lib/models";
const SpotsMap = dynamic(() => import("./SpotsMap"), {
  ssr: false,
  loading: () => <p className="p-6">Loading map…</p>,
});
export default function JournalApp({ mode }: { mode: "list" | "map" }) {
  const { user, cachedSession } = useAuth();
  const uid = user?.uid ?? cachedSession?.uid;
  const context = useMapContext();
  const [filters, setFilters] = useState<Filters>(defaultFilters),
    [selected, setSelected] = useState<Venue | null>(null),
    [tools, setTools] = useState(false),
    [initialAction, setInitialAction] = useState<"visit" | "wishlist">();
  const owned = useCallback(
    (r: { userId?: string }) => !r.userId || r.userId === uid,
    [uid],
  );
  const rawSpots = useLiveQuery(
    () => db.venues.filter(owned).toArray(),
    [owned],
  );
  const rawVisits = useLiveQuery(
    () => db.visitLogs.filter(owned).toArray(),
    [owned],
  );
  const rawCollections = useLiveQuery(
    () => db.collections.filter(owned).toArray(),
    [owned],
  );
  // Only pending-photo identifiers enter React state; never retain image blobs here.
  const pendingPhotos = useLiveQuery(async () => {
    const ids: { id: string; visitLogId: string }[] = [];
    await db.photoQueue
      .where("status")
      .equals("pending")
      .filter(owned)
      .each((photo) =>
        ids.push({ id: photo.id, visitLogId: photo.visitLogId }),
      );
    return ids;
  }, [owned]);
  const spots = useMemo(
    () => rawSpots?.filter((s) => !s.isDeleted) ?? [],
    [rawSpots],
  );
  const visits = useMemo(
    () => rawVisits?.filter((v) => !v.isDeleted) ?? [],
    [rawVisits],
  );
  const collections = useMemo(
    () => rawCollections?.filter((c) => !c.isDeleted) ?? [],
    [rawCollections],
  );
  const pendingRecords = useMemo(
    () =>
      [
        ...(rawSpots ?? []),
        ...(rawVisits ?? []),
        ...(rawCollections ?? []),
      ].filter((r) => r.syncStatus !== "synced"),
    [rawSpots, rawVisits, rawCollections],
  );
  const revision = useMemo(
    () =>
      pendingRecords.map((r) => `${r.id}:${r.updatedAt}`).join("|") +
      ";" +
      (pendingPhotos ?? []).map((photo) => photo.id).join("|"),
    [pendingRecords, pendingPhotos],
  );
  const syncError = useJournalSync(user?.uid, revision);
  const pending = useMemo(() => {
    const deletedVisits = new Set(
      rawVisits?.filter((visit) => visit.isDeleted).map((visit) => visit.id),
    );
    return (
      pendingRecords.length +
      (pendingPhotos?.filter((photo) => !deletedVisits.has(photo.visitLogId))
        .length ?? 0)
    );
  }, [pendingRecords, pendingPhotos, rawVisits]);
  const filtered = useMemo(
    () => filterSpots(spots, visits, filters, context.position),
    [spots, visits, filters, context.position],
  );
  const selectSpot = useCallback((spot: Spot) => {
    setInitialAction(undefined);
    setSelected(journalVenue(spot));
  }, []);
  useEffect(() => {
    const launch = () => {
      const params = new URLSearchParams(
        window.location.hash.slice(1) || window.location.search,
      );
      if (params.get("status") === "wishlist")
        setFilters({ ...defaultFilters, status: "wishlist", sort: "nearest" });
      if (params.get("action") === "log") {
        setInitialAction("visit");
        setSelected({
          key: "quick-log",
          name: "",
          category: "restaurant",
          location: {
            lat: 0,
            lng: 0,
            formattedAddress: "Location not recorded",
          },
        });
      }
    };
    launch();
    window.addEventListener("hashchange", launch);
    return () => window.removeEventListener("hashchange", launch);
  }, []);
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current) return;
    const id = new URLSearchParams(
      window.location.hash.slice(1) || window.location.search,
    ).get("spot");
    if (id && rawSpots) {
      const spot = rawSpots.find((s) => s.id === id && !s.isDeleted);
      // Resolve an external venue deep link after IndexedDB loads.
      if (spot) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelected(journalVenue(spot));
        deepLinkHandled.current = true;
      }
    }
  }, [rawSpots]);
  const save: SaveVenue = useCallback(
    async (venue, draft, visit, duplicateId) => {
      const spot = await saveJournalEntry(
        venue,
        draft,
        visit,
        uid,
        duplicateId,
      );
      setSelected(journalVenue(spot));
      setInitialAction(undefined);
    },
    [uid],
  );
  function pick() {
    if (filtered.length) {
      setInitialAction(undefined);
      setSelected(
        journalVenue(filtered[Math.floor(Math.random() * filtered.length)]),
      );
    }
  }
  const navigation = (
    <header className="journal-controls flex shrink-0 flex-wrap items-center justify-between gap-1 px-1 py-1">
      <Link
        prefetch={false}
        href="/"
        className="text-base font-serif font-bold"
        aria-label="KeepCheck journal"
      >
        KeepCheck
      </Link>
      <nav className="flex gap-1">
        {mode !== "list" && (
          <Link
            prefetch={false}
            aria-label="View journal"
            href="/"
          >
            Journal
          </Link>
        )}
        {mode !== "map" && (
          <Link
            prefetch={false}
            aria-label="View map"
            href="/map"
          >
            Map
          </Link>
        )}
        {!user && (
          <Link prefetch={false} href="/login" aria-label="Sign in to sync">
            Sign in
          </Link>
        )}
        <button aria-label="Open journal tools" onClick={() => setTools(true)}>
          ☷
        </button>
      </nav>
    </header>
  );
  const filterControl = (
    <JournalFilters
      value={filters}
      onChange={setFilters}
      collections={collections}
      hasGps={!!context.position}
      onPick={pick}
      canPick={!!filtered.length}
    />
  );
  const statusTabs = <StatusTabs value={filters} onChange={setFilters} />;
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTools(false);
        if (mode === "list") setSelected(null);
      }
      const target = event.target;
      if (
        mode === "list" &&
        ((event.key === "k" && (event.ctrlKey || event.metaKey)) ||
          (event.key === "/" &&
            !(
              target instanceof HTMLElement &&
              (target.isContentEditable ||
                /INPUT|TEXTAREA|SELECT/.test(target.tagName))
            )))
      ) {
        event.preventDefault();
        document
          .querySelector<HTMLInputElement>('[aria-label="Search saved venues"]')
          ?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [mode]);
  return (
    <main className="journal-app flex h-[100dvh] flex-col bg-bg text-text-primary">
      {mode === "list" && (
        <div className="px-3">
          {navigation}
          <div className="flex items-center gap-2">
            {filterControl}
            {statusTabs}
          </div>
          {syncError && (
            <p role="status" className="text-xs">
              Sync paused · data is safe on this device.
            </p>
          )}
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        {mode === "map" ? (
          <SpotsMap
            navigation={navigation}
            filters={filterControl}
            statusTabs={statusTabs}
            syncError={syncError}
            spots={filtered}
            allSpots={spots}
            collections={collections}
            onSave={save}
            context={context}
            pending={pending}
            externalSelection={selected}
            onSelection={setSelected}
          />
        ) : (
          <>
            <div className="h-full overflow-auto p-3">
              <div className="mb-3 flex flex-wrap gap-2 text-xs" role="status">
                <span>{context.online ? "Online" : "Offline Mode"}</span>
                <span>{pending} pending sync</span>
                <span>{context.gps}</span>
              </div>
              <input
                className="mb-3 w-full rounded-xl border p-3"
                aria-label="Search saved venues"
                placeholder="Search your journal…"
                value={filters.query}
                onChange={(e) =>
                  setFilters({ ...filters, query: e.target.value })
                }
              />
              <div className="mb-3 flex gap-2 journal-controls">
                <Link prefetch={false} href="/map" aria-label="Discover venues">
                  Discover venues →
                </Link>
                <button
                  aria-label="Quick log visit"
                  onClick={() => {
                    setInitialAction("visit");
                    setSelected({
                      key: "quick-log",
                      name: "",
                      category: "restaurant",
                      location: context.position
                        ? {
                            ...context.position,
                            formattedAddress: `${context.position.lat.toFixed(5)}, ${context.position.lng.toFixed(5)}`,
                          }
                        : {
                            lat: 0,
                            lng: 0,
                            formattedAddress: "Location not recorded",
                          },
                    });
                  }}
                >
                  + Quick log
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((s) => (
                  <SpotCard
                    key={s.id}
                    spot={s}
                    active={selected?.record?.id === s.id}
                    distance={
                      context.position && !s.locationMissing
                        ? haversine(context.position, s.location)
                        : undefined
                    }
                    onSelect={selectSpot}
                  />
                ))}
              </div>
              {!filtered.length && (
                <p className="p-6 text-center">
                  No matching venues. Change your filters or discover a new
                  place.
                </p>
              )}
            </div>
            {selected && (
              <VenueSheet
                key={selected.key}
                venue={selected}
                position={context.position}
                online={context.online}
                onClose={() => {
                  setSelected(null);
                  setInitialAction(undefined);
                }}
                onSave={save}
                collections={collections}
                initialAction={initialAction}
              />
            )}
          </>
        )}
      </div>
      {tools && (
        <JournalTools
          uid={uid}
          spots={spots}
          visits={visits}
          collections={collections}
          onClose={() => setTools(false)}
        />
      )}
    </main>
  );
}
