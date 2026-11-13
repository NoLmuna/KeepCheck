"use client";
import { useEffect, useState, useMemo } from "react";
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
import { journalVenue, formatDistance, haversine, type Venue } from "@/lib/geo";
import VenueSheet, { type SaveVenue } from "./VenueSheet";
import JournalFilters from "./JournalFilters";
import JournalTools from "./JournalTools";
import JournalPhoto from "./JournalPhoto";
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
  const data = useLiveQuery(async () => {
    const owned = (r: { userId?: string }) => !r.userId || r.userId === uid;
    return {
      spots: await db.venues.filter(owned).toArray(),
      visits: await db.visitLogs.filter(owned).toArray(),
      collections: await db.collections.filter(owned).toArray(),
      photos: await db.photoQueue.filter(owned).toArray(),
    };
  }, [uid]);
  const spots = useMemo(
    () => data?.spots.filter((s) => !s.isDeleted) ?? [],
    [data],
  );
  const visits = useMemo(
    () => data?.visits.filter((v) => !v.isDeleted) ?? [],
    [data],
  );
  const collections = data?.collections.filter((c) => !c.isDeleted) ?? [];
  const revision = data
    ? [...data.spots, ...data.visits, ...data.collections]
        .filter((r) => r.syncStatus !== "synced")
        .map((r) => `${r.id}:${r.updatedAt}`)
        .join("|") +
      ";" +
      data.photos
        .filter((p) => p.status === "pending")
        .map((p) => p.id)
        .join("|")
    : "";
  const syncError = useJournalSync(user?.uid, revision);
  const pending = data
    ? [...data.spots, ...data.visits, ...data.collections].filter(
        (r) => r.syncStatus !== "synced",
      ).length +
      data.photos.filter(
        (p) =>
          p.status === "pending" &&
          !data.visits.find((v) => v.id === p.visitLogId)?.isDeleted,
      ).length
    : 0;
  const filtered = filterSpots(spots, visits, filters, context.position);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("status") === "wishlist")
      // URL shortcuts are external state, applied after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFilters({ ...defaultFilters, status: "wishlist", sort: "nearest" });
    if (params.get("action") === "log") {
      setInitialAction("visit");
      setSelected({
        key: "quick-log",
        name: "",
        category: "restaurant",
        location: { lat: 0, lng: 0, formattedAddress: "Location not recorded" },
      });
    }
  }, []);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("spot");
    if (id && data) {
      const spot = data.spots.find((s) => s.id === id && !s.isDeleted);
      // Resolve an external venue deep link after IndexedDB loads.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (spot) setSelected(journalVenue(spot));
    }
  }, [data]);
  const save: SaveVenue = async (venue, draft, visit, duplicateId) => {
    const spot = await saveJournalEntry(venue, draft, visit, uid, duplicateId);
    setSelected(journalVenue(spot));
    setInitialAction(undefined);
  };
  function pick() {
    if (filtered.length) {
      setInitialAction(undefined);
      setSelected(
        journalVenue(filtered[Math.floor(Math.random() * filtered.length)]),
      );
    }
  }
  return (
    <main className="journal-app flex h-[100dvh] flex-col bg-bg text-text-primary">
      <header className="journal-controls flex shrink-0 flex-wrap items-center justify-between gap-1 px-3 py-2">
        <Link
          href="/"
          className="text-xl font-serif font-bold"
          aria-label="KeepCheck journal"
        >
          KeepCheck
        </Link>
        <nav className="flex gap-1">
          <Link
            aria-label="View journal"
            aria-current={mode === "list" ? "page" : undefined}
            href="/"
          >
            Journal
          </Link>
          <Link
            aria-label="View map"
            aria-current={mode === "map" ? "page" : undefined}
            href="/map"
          >
            Map
          </Link>
          <button
            aria-label="Open journal tools"
            onClick={() => setTools(true)}
          >
            ☷ Tools
          </button>
        </nav>
      </header>
      <JournalFilters
        value={filters}
        onChange={setFilters}
        collections={collections}
        hasGps={!!context.position}
      />
      <div className="journal-controls flex shrink-0 items-center gap-2 px-3 py-1">
        <button
          aria-label="Pick For Me"
          disabled={!filtered.length}
          onClick={pick}
        >
          ✦ Pick For Me
        </button>
        <span className="text-xs">{filtered.length} matching venues</span>
        <span className="ml-auto text-xs">
          {uid ? "Account journal" : "Guest · local only"}
        </span>
      </div>
      {syncError && (
        <p role="status" className="px-3 text-xs">
          Sync paused · data is safe on this device. {syncError}
        </p>
      )}
      <div className="relative min-h-0 flex-1">
        {mode === "map" ? (
          <SpotsMap
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
                <Link href="/map" aria-label="Discover venues">
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
                  <button
                    className={`rounded-2xl border p-4 text-left ${selected?.record?.id === s.id ? "border-accent ring-2 ring-accent" : "border-text-secondary/20"}`}
                    key={s.id}
                    aria-label={`View ${s.name}`}
                    onClick={() => {
                      setInitialAction(undefined);
                      setSelected(journalVenue(s));
                    }}
                  >
                    <span className="text-xs uppercase tracking-wide">
                      {s.category} ·{" "}
                      {s.status === "wishlist"
                        ? "🔖 Wishlist"
                        : `★ ${s.overallRating?.toFixed(1) ?? "—"}/5`}
                    </span>
                    <h2 className="text-xl font-serif font-bold">{s.name}</h2>
                    <p className="text-sm">{s.location.formattedAddress}</p>
                    <p className="text-sm">
                      {context.position && !s.locationMissing
                        ? `${formatDistance(haversine(context.position, s.location))} away`
                        : ""}{" "}
                      {s.budgetTier}
                    </p>
                    <p className="mt-2 text-xs">
                      {s.vibeTags
                        .map((v) => v.replaceAll("-", " "))
                        .join(" · ")}
                    </p>
                    {s.localCoverPhotoId && (
                      <JournalPhoto
                        id={s.localCoverPhotoId}
                        url={s.coverPhotoUrl}
                        alt={`${s.name} cover`}
                      />
                    )}
                  </button>
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
