"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import {
  Compass,
  MapPin,
  Plus,
  BookOpen,
  SlidersHorizontal,
  Cloud,
  CheckCircle2,
  RefreshCw,
  LogOut,
  Folder,
  Download,
  Search,
  User as UserIcon,
  Sparkles,
  ChevronDown,
  WifiOff,
} from "lucide-react";
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
import { searchVenues } from "@/lib/osm";
import VenueSheet, { type SaveVenue } from "./VenueSheet";
import JournalFilters, { StatusTabs } from "./JournalFilters";
import SpotCard from "./SpotCard";
import LogSpotModal from "./LogSpotModal";
import type { Spot } from "@/lib/models";
import { GoogleIcon } from "./LandingPage";

const JournalTools = dynamic(() => import("./JournalTools"), { ssr: false });
const SpotsMap = dynamic(() => import("./SpotsMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex flex-col items-center justify-center bg-[#F8F6F2] text-stone-500 gap-3">
      <div className="w-8 h-8 border-3 border-stone-300 border-t-amber-700 rounded-full animate-spin" />
      <span className="text-xs font-medium">Loading discovery map…</span>
    </div>
  ),
});

export default function JournalApp({ mode = "split" }: { mode?: "list" | "map" | "split" }) {
  const { user, cachedSession, isGuest, signInWithGoogle, signOut } = useAuth();
  const uid = user?.uid ?? cachedSession?.uid;
  const context = useMapContext();

  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [selected, setSelected] = useState<Venue | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"map" | "journal">(
    mode === "list" ? "journal" : "map"
  );

  // Search input and Photon dropdown in sidebar
  const [searchQuery, setSearchQuery] = useState("");
  const [photonResults, setPhotonResults] = useState<Venue[]>([]);
  const [searchingPhoton, setSearchingPhoton] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);

  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    const dismiss = (e: MouseEvent) => {
      if (!userMenuRef.current?.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [userMenuOpen]);

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

  // Combine query into filters
  const effectiveFilters = useMemo(
    () => ({ ...filters, query: searchQuery }),
    [filters, searchQuery]
  );

  const filtered = useMemo(
    () => filterSpots(spots, visits, effectiveFilters, context.position),
    [spots, visits, effectiveFilters, context.position],
  );

  // Live Photon search when user types in sidebar
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setPhotonResults([]);
      setShowSearchDropdown(false);
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    const timer = setTimeout(async () => {
      setSearchingPhoton(true);
      try {
        const found = await searchVenues(
          searchQuery.trim(),
          context.rawPosition.current,
          controller.signal
        );
        if (!controller.signal.aborted && found) {
          // Exclude already saved matches
          const savedNames = new Set(spots.map((s) => s.name.toLowerCase()));
          const newPlaces = found.filter(
            (p) => !savedNames.has(p.name.toLowerCase())
          );
          setPhotonResults(newPlaces);
          setShowSearchDropdown(newPlaces.length > 0);
        }
      } catch {
        // Ignored
      } finally {
        setSearchingPhoton(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, context.rawPosition, spots]);

  const selectSpot = useCallback((spot: Spot) => {
    setSelected(journalVenue(spot));
  }, []);

  // Deep Link handling
  useEffect(() => {
    const launch = () => {
      const params = new URLSearchParams(
        window.location.hash.slice(1) || window.location.search,
      );
      if (params.get("status") === "wishlist")
        setFilters((prev) => ({ ...prev, status: "wishlist", sort: "nearest" }));
      if (params.get("action") === "log") {
        setLogModalOpen(true);
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
      if (spot) {
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
    },
    [uid],
  );

  function pickRandomSpot() {
    if (filtered.length) {
      const random = filtered[Math.floor(Math.random() * filtered.length)];
      setSelected(journalVenue(random));
    }
  }

  // Keyboard shortcut for search
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setToolsOpen(false);
        setUserMenuOpen(false);
        setLogModalOpen(false);
        setShowSearchDropdown(false);
      }
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
        document
          .querySelector<HTMLInputElement>('[aria-label="Search saved venues"]')
          ?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  return (
    <main className="journal-app h-[100dvh] w-full flex flex-col bg-[#F8F6F2] text-stone-900 overflow-hidden font-sans select-none">
      {/* ------------------------------------------------------------------ */}
      {/*  Top Compact App Header (h-14, border-stone-200)                    */}
      {/* ------------------------------------------------------------------ */}
      <header className="h-14 bg-white border-b border-stone-200/90 px-3 sm:px-5 flex items-center justify-between shrink-0 z-30 shadow-2xs">
        {/* Left: Brand + Status Pill */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            prefetch={false}
            className="flex items-center gap-2 group cursor-pointer"
            aria-label="KeepCheck home"
          >
            <div className="w-8 h-8 rounded-lg overflow-hidden border border-stone-200/80 bg-[#F8F6F2] flex items-center justify-center shadow-2xs group-hover:border-amber-400 transition-colors">
              <Image
                src="/KeepCheck-Logo.png"
                alt="KeepCheck logo"
                width={26}
                height={26}
                className="object-contain"
                priority
              />
            </div>
            <span className="font-serif font-bold text-lg text-stone-900 tracking-tight group-hover:text-amber-800 transition-colors">
              KeepCheck
            </span>
          </Link>

          {/* Subtle Status Pill: Synced / Syncing / Offline */}
          <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-stone-100/90 border border-stone-200 text-stone-600">
            {!context.online ? (
              <>
                <WifiOff className="w-3 h-3 text-stone-500" />
                <span>Offline Mode</span>
              </>
            ) : pending > 0 ? (
              <>
                <RefreshCw className="w-3 h-3 text-amber-600 animate-spin" />
                <span>Syncing ({pending})</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-stone-700">Synced</span>
              </>
            )}
          </div>
        </div>

        {/* Right: + Log Spot, Insights/Collections Button, User Profile Avatar */}
        <div className="flex items-center gap-2">
          {/* Primary CTA: + Log Spot */}
          <button
            type="button"
            onClick={() => setLogModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-700 hover:bg-amber-800 active:bg-amber-900 text-white text-xs font-bold rounded-lg shadow-xs hover:shadow-sm transition-all cursor-pointer"
            aria-label="Log a new spot"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">+ Log Spot</span>
            <span className="sm:hidden font-semibold">Log</span>
          </button>

          {/* Tools & Insights Button */}
          <button
            type="button"
            onClick={() => setToolsOpen(true)}
            aria-label="Open insights and tools"
            title="Insights & Collections"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-600 hover:text-stone-900 hover:bg-stone-100 border border-stone-200/80 transition-colors cursor-pointer"
          >
            <Folder className="w-4 h-4" />
          </button>

          {/* User Profile Avatar & Dropdown */}
          <div ref={userMenuRef} className="relative">
            {user ? (
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                aria-label="User account menu"
                aria-expanded={userMenuOpen}
                className="flex items-center gap-1.5 p-1 rounded-lg hover:bg-stone-100 border border-transparent hover:border-stone-200 transition-colors cursor-pointer"
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt=""
                    className="w-7 h-7 rounded-full object-cover ring-1 ring-amber-400"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-900 font-bold text-xs flex items-center justify-center">
                    {(user.displayName?.[0] ?? user.email?.[0] ?? "U").toUpperCase()}
                  </div>
                )}
                <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
              </button>
            ) : isGuest ? (
              <button
                type="button"
                onClick={() => signInWithGoogle()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-stone-50 text-stone-800 text-xs font-semibold rounded-lg border border-stone-300 shadow-2xs transition-colors cursor-pointer"
              >
                <GoogleIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign in with Google</span>
                <span className="sm:hidden">Sign in</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => signInWithGoogle()}
                className="w-8 h-8 rounded-lg bg-stone-100 text-stone-700 flex items-center justify-center"
              >
                <UserIcon className="w-4 h-4" />
              </button>
            )}

            {/* Profile Dropdown Menu */}
            {userMenuOpen && user && (
              <div className="absolute right-0 top-full mt-2 z-50 w-64 bg-white border border-stone-200 rounded-2xl shadow-xl p-2.5 space-y-2 text-xs text-stone-900">
                {/* User Info Header */}
                <div className="p-2 bg-[#F8F6F2] rounded-xl flex items-center gap-2.5 border border-stone-200/60">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt=""
                      className="w-9 h-9 rounded-full object-cover ring-1 ring-amber-400"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-900 font-bold text-sm flex items-center justify-center">
                      {(user.displayName?.[0] ?? user.email?.[0] ?? "U").toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-stone-900 truncate">
                      {user.displayName ?? "Signed-in User"}
                    </p>
                    <p className="text-[11px] text-stone-500 truncate">{user.email}</p>
                  </div>
                </div>

                {/* Cloud Sync Status item */}
                <div className="px-2.5 py-1.5 text-stone-600 flex items-center justify-between border-b border-stone-100 pb-2">
                  <span>Cloud Sync</span>
                  <span className="font-semibold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    {pending > 0 ? `${pending} pending` : "Up to date"}
                  </span>
                </div>

                {/* Menu Action: Backup & Export */}
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    setToolsOpen(true);
                  }}
                  className="w-full px-2.5 py-2 text-left font-medium text-stone-700 hover:bg-stone-50 rounded-lg flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Download className="w-4 h-4 text-stone-500" />
                  <span>Backup & Export Data</span>
                </button>

                {/* Menu Action: Collections & Tags */}
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    setToolsOpen(true);
                  }}
                  className="w-full px-2.5 py-2 text-left font-medium text-stone-700 hover:bg-stone-50 rounded-lg flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Folder className="w-4 h-4 text-stone-500" />
                  <span>Collections & Insights</span>
                </button>

                {/* Sign Out Action */}
                <div className="pt-1 border-t border-stone-100">
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      void signOut();
                    }}
                    className="w-full px-2.5 py-2 text-left font-medium text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <LogOut className="w-4 h-4 text-red-500" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/*  Main Content Workspace                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 relative flex overflow-hidden min-h-0">
        {/* ---------------------------------------------------------------- */}
        {/*  Desktop Left Sidebar (w-[400px] lg:w-[430px])                   */}
        {/*  On mobile: only rendered if mobileTab === "journal"             */}
        {/* ---------------------------------------------------------------- */}
        <aside
          className={`w-full md:w-[400px] lg:w-[430px] shrink-0 bg-[#F8F6F2] border-r border-stone-200/90 flex flex-col h-full z-10 ${
            mobileTab === "map" ? "hidden md:flex" : "flex"
          }`}
        >
          {/* If a venue is selected on desktop, show the VenueSheet in sidebar */}
          {selected ? (
            <div className="h-full flex flex-col overflow-hidden bg-white">
              <VenueSheet
                embedded
                venue={selected}
                collections={collections}
                position={context.position}
                online={context.online}
                onClose={() => setSelected(null)}
                onSave={save}
              />
            </div>
          ) : (
            <>
              {/* Search & Filter Header (p-4 bg-white border-b) */}
              <div className="p-3.5 sm:p-4 bg-white border-b border-stone-200/90 space-y-3 shrink-0">
                {/* Search Input with Photon Autocomplete */}
                <div className="relative">
                  <div className="relative flex items-center">
                    <Search className="absolute left-3 w-4 h-4 text-stone-400 pointer-events-none" />
                    <input
                      aria-label="Search saved venues"
                      placeholder="Search saved spots or places…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full h-10 pl-9 pr-8 rounded-xl bg-stone-100 hover:bg-stone-50 focus:bg-white text-xs sm:text-sm text-stone-900 border border-stone-200/70 focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20 outline-none transition-all placeholder:text-stone-400"
                    />
                    {searchingPhoton && (
                      <div className="absolute right-3 w-3.5 h-3.5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>

                  {/* Photon Dropdown Results */}
                  {showSearchDropdown && photonResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 z-40 max-h-56 overflow-y-auto bg-white border border-stone-200 rounded-xl shadow-lg divide-y divide-stone-100">
                      <div className="p-2 bg-stone-50 text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                        Discovered Places (Tap to Log)
                      </div>
                      {photonResults.slice(0, 5).map((place) => (
                        <button
                          key={place.key}
                          type="button"
                          onClick={() => {
                            setSelected(place);
                            setShowSearchDropdown(false);
                          }}
                          className="w-full p-2.5 text-left hover:bg-amber-50/50 flex items-start gap-2.5 transition-colors cursor-pointer"
                        >
                          <Compass className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-stone-900 truncate">
                              {place.name}
                            </p>
                            <p className="text-[11px] text-stone-500 truncate">
                              {place.location.locality || place.location.formattedAddress}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Segmented Status Tabs + Filters Button */}
                <div className="flex items-center justify-between gap-2">
                  <StatusTabs value={filters} onChange={setFilters} />
                  <JournalFilters
                    value={filters}
                    onChange={setFilters}
                    collections={collections}
                    hasGps={!!context.position}
                    onPick={pickRandomSpot}
                    canPick={!!filtered.length}
                  />
                </div>
              </div>

              {/* Scrollable Spot Card List */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                <div className="flex items-center justify-between px-1 text-xs text-stone-500 font-medium">
                  <span>{filtered.length} {filtered.length === 1 ? "spot" : "spots"} saved</span>
                  {context.position && <span>Sorted by GPS distance</span>}
                </div>

                {filtered.map((spot) => (
                  <SpotCard
                    key={spot.id}
                    spot={spot}
                    active={false}
                    distance={
                      context.position && !spot.locationMissing
                        ? haversine(context.position, spot.location)
                        : undefined
                    }
                    onSelect={selectSpot}
                  />
                ))}

                {filtered.length === 0 && (
                  <div className="p-8 text-center bg-white rounded-2xl border border-stone-200/80 my-4 space-y-2">
                    <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center mx-auto">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <h3 className="font-serif font-bold text-stone-900 text-sm">
                      No spots match this filter
                    </h3>
                    <p className="text-xs text-stone-500 max-w-xs mx-auto">
                      Try resetting your filters, or tap “+ Log Spot” to add your favorite café or restaurant.
                    </p>
                    <button
                      type="button"
                      onClick={() => setFilters(defaultFilters)}
                      className="mt-2 text-xs font-bold text-amber-700 hover:underline"
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </aside>

        {/* ---------------------------------------------------------------- */}
        {/*  Right Interactive Map Canvas                                    */}
        {/*  Always visible on desktop split-screen; on mobile when tab==='map' */}
        {/* ---------------------------------------------------------------- */}
        <div
          className={`flex-1 relative h-full min-h-0 ${
            mobileTab === "journal" ? "hidden md:block" : "block"
          }`}
        >
          <SpotsMap
            splitPaneMode={true}
            spots={filtered}
            allSpots={spots}
            collections={collections}
            onSave={save}
            context={context}
            pending={pending}
            externalSelection={selected}
            onSelection={(venue) => setSelected(venue)}
          />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/*  Mobile Bottom Navigation Tab Bar (< 768px)                         */}
      {/* ------------------------------------------------------------------ */}
      <nav className="md:hidden h-14 bg-white border-t border-stone-200/90 px-3 flex items-center justify-around shrink-0 z-30">
        <button
          type="button"
          onClick={() => {
            setMobileTab("map");
          }}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold cursor-pointer ${
            mobileTab === "map" ? "text-amber-700" : "text-stone-500 hover:text-stone-800"
          }`}
        >
          <Compass className="w-5 h-5" />
          <span>Explore Map</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMobileTab("journal");
          }}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold cursor-pointer ${
            mobileTab === "journal" ? "text-amber-700" : "text-stone-500 hover:text-stone-800"
          }`}
        >
          <BookOpen className="w-5 h-5" />
          <span>My Journal ({spots.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setLogModalOpen(true)}
          className="flex flex-col items-center gap-0.5 text-[10px] font-bold text-amber-700 cursor-pointer"
        >
          <div className="w-7 h-7 rounded-full bg-amber-700 text-white flex items-center justify-center shadow-xs">
            <Plus className="w-4 h-4" />
          </div>
          <span>Log Spot</span>
        </button>

        <button
          type="button"
          onClick={() => setToolsOpen(true)}
          className="flex flex-col items-center gap-0.5 text-[10px] font-bold text-stone-500 hover:text-stone-800 cursor-pointer"
        >
          <Folder className="w-5 h-5" />
          <span>Insights</span>
        </button>
      </nav>

      {/* ------------------------------------------------------------------ */}
      {/*  Modal Overlays: + Log Spot Modal & Journal Tools                   */}
      {/* ------------------------------------------------------------------ */}
      {logModalOpen && (
        <LogSpotModal
          initialVenue={selected}
          position={context.position}
          collections={collections}
          onClose={() => setLogModalOpen(false)}
          onSaved={(newSpot) => {
            setSelected(journalVenue(newSpot));
            setLogModalOpen(false);
          }}
        />
      )}

      {toolsOpen && (
        <JournalTools
          uid={uid}
          spots={spots}
          visits={visits}
          collections={collections}
          onClose={() => setToolsOpen(false)}
        />
      )}
    </main>
  );
}
