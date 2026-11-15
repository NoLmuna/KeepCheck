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
  AlertCircle,
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
import { searchVenues, autoResolveLegacySpotLocations } from "@/lib/osm";
import VenueSheet, { type SaveVenue } from "./VenueSheet";
import JournalFilters, { StatusTabs } from "./JournalFilters";
import SpotCard from "./SpotCard";
import LogSpotModal from "./LogSpotModal";
import ThemeToggle from "./ThemeToggle";
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

  // Auto-resolve legacy spots with raw coordinates in background
  const autoResolvedRef = useRef(false);
  useEffect(() => {
    if (!context.online || !spots.length || autoResolvedRef.current) return;
    autoResolvedRef.current = true;
    void autoResolveLegacySpotLocations(spots);
  }, [spots, context.online]);

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
    <main className="journal-app h-[100dvh] w-full flex flex-col bg-[#F8F6F2] dark:bg-[#120e0b] text-stone-900 dark:text-stone-100 overflow-hidden font-sans select-none">
      {/* ------------------------------------------------------------------ */}
      {/*  Top Compact App Header (h-14, border-stone-200)                    */}
      {/* ------------------------------------------------------------------ */}
      <header className="h-14 bg-white dark:bg-[#18181b] border-b border-stone-200/90 dark:border-stone-800 px-3 sm:px-5 flex items-center justify-between shrink-0 z-30 shadow-2xs">
        {/* Left: Brand + Status Pill */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            prefetch={false}
            className="flex items-center gap-2 group cursor-pointer"
            aria-label="KeepCheck home"
          >
            <div className="w-8 h-8 rounded-lg overflow-hidden border border-stone-200/80 dark:border-stone-700 bg-[#F8F6F2] dark:bg-stone-800 flex items-center justify-center shadow-2xs group-hover:border-amber-400 dark:group-hover:border-amber-500 transition-colors">
              <Image
                src="/KeepCheck-Logo.png"
                alt="KeepCheck logo"
                width={26}
                height={26}
                className="object-contain"
                priority
              />
            </div>
            <span className="font-serif font-bold text-lg text-stone-900 dark:text-stone-100 tracking-tight group-hover:text-amber-800 dark:group-hover:text-amber-400 transition-colors">
              KeepCheck
            </span>
          </Link>

          {/* Subtle Status Pill: Saved / Syncing / Offline */}
          <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-stone-100 dark:bg-stone-800 border border-stone-200/90 dark:border-stone-700 text-stone-700 dark:text-stone-200 shadow-2xs">
            {!context.online ? (
              <>
                <WifiOff className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
                <span>Offline</span>
              </>
            ) : syncError ? (
              <span title={syncError} className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Saved locally</span>
              </span>
            ) : pending > 0 ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                <span>Syncing ({pending})</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs" />
                <span>Saved</span>
              </>
            )}
          </div>
        </div>

        {/* Right: + Save Spot, Light/Dark Toggle, My Lists & Stats Button, User Profile Avatar */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Primary CTA: Save Spot */}
          <button
            type="button"
            onClick={() => setLogModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-700 hover:bg-amber-800 active:bg-amber-900 text-white text-xs font-bold rounded-lg shadow-xs hover:shadow-sm transition-all cursor-pointer"
            aria-label="Save a spot"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Save Spot</span>
            <span className="sm:hidden font-semibold">Save</span>
          </button>

          {/* Light / Dark Mode Toggle */}
          <ThemeToggle />

          {/* My Lists & Stats Button */}
          <button
            type="button"
            onClick={() => setToolsOpen(true)}
            aria-label="Open my lists and stats"
            title="My Lists & Stats"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-stone-700 dark:text-stone-200 hover:text-stone-900 dark:hover:text-white bg-stone-100 dark:bg-stone-800 hover:bg-stone-200/80 dark:hover:bg-stone-700 border border-stone-200 dark:border-stone-700 transition-colors cursor-pointer"
          >
            <Folder className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
            <span className="hidden sm:inline">My Lists & Stats</span>
            <span className="sm:hidden">Lists</span>
          </button>

          {/* User Profile Avatar & Dropdown */}
          <div ref={userMenuRef} className="relative">
            {user ? (
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                aria-label="User account menu"
                aria-expanded={userMenuOpen}
                className="flex items-center gap-1.5 p-1 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 border border-transparent hover:border-stone-200 dark:hover:border-stone-700 transition-colors cursor-pointer"
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
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-stone-850 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 text-xs font-semibold rounded-lg border border-stone-300 dark:border-stone-700 shadow-2xs transition-colors cursor-pointer"
              >
                <GoogleIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign in with Google</span>
                <span className="sm:hidden">Sign in</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => signInWithGoogle()}
                className="w-8 h-8 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 flex items-center justify-center"
              >
                <UserIcon className="w-4 h-4" />
              </button>
            )}

            {/* Profile Dropdown Menu */}
            {userMenuOpen && user && (
              <div className="absolute right-0 top-full mt-2 z-50 w-64 bg-white dark:bg-[#1c1917] border border-stone-200 dark:border-stone-800 rounded-2xl shadow-xl p-2.5 space-y-2 text-xs text-stone-900 dark:text-stone-100">
                {/* User Info Header */}
                <div className="p-2 bg-[#F8F6F2] dark:bg-stone-800/60 rounded-xl flex items-center gap-2.5 border border-stone-200/60 dark:border-stone-700">
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
                    <p className="font-bold text-stone-900 dark:text-stone-100 truncate">
                      {user.displayName ?? "Signed-in User"}
                    </p>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">{user.email}</p>
                  </div>
                </div>

                {/* Cloud Sync Status item */}
                <div className="px-2.5 py-1.5 text-stone-600 dark:text-stone-400 flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-2">
                  <span>Cloud Sync</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    {pending > 0 ? `${pending} pending` : "Up to date"}
                  </span>
                </div>

                {/* Theme Toggle row in menu */}
                <div className="px-1 border-b border-stone-100 dark:border-stone-800 pb-1">
                  <ThemeToggle showLabel className="w-full justify-start px-2 py-1.5 font-medium" />
                </div>

                {/* Menu Action: Backup & Export */}
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    setToolsOpen(true);
                  }}
                  className="w-full px-2.5 py-2 text-left font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Download className="w-4 h-4 text-stone-500 dark:text-stone-400" />
                  <span>Backup & Export Data</span>
                </button>

                {/* Menu Action: Collections & Tags */}
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    setToolsOpen(true);
                  }}
                  className="w-full px-2.5 py-2 text-left font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Folder className="w-4 h-4 text-stone-500 dark:text-stone-400" />
                  <span>Collections & Insights</span>
                </button>

                {/* Sign Out Action */}
                <div className="pt-1 border-t border-stone-100 dark:border-stone-800">
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      void signOut();
                    }}
                    className="w-full px-2.5 py-2 text-left font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg flex items-center gap-2 cursor-pointer transition-colors"
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
          className={`w-full md:w-[400px] lg:w-[430px] shrink-0 bg-[#F8F6F2] dark:bg-[#120e0b] border-r border-stone-200/90 dark:border-stone-800 flex flex-col h-full z-10 ${
            mobileTab === "map" ? "hidden md:flex" : "flex"
          }`}
        >
          {/* If a venue is selected on desktop, show the VenueSheet in sidebar */}
          {selected ? (
            <div className="h-full flex flex-col overflow-hidden bg-white dark:bg-[#18181b]">
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
              <div className="p-3.5 sm:p-4 bg-white dark:bg-[#18181b] border-b border-stone-200/90 dark:border-stone-800 space-y-3 shrink-0">
                {/* Search Input with Photon Autocomplete */}
                <div className="relative">
                  <div className="relative flex items-center">
                    <Search className="absolute left-3 w-4 h-4 text-stone-400 dark:text-stone-500 pointer-events-none" />
                    <input
                      aria-label="Search saved venues"
                      placeholder="Search saved spots or places…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full h-10 pl-9 pr-8 rounded-xl bg-stone-100 dark:bg-stone-800/90 hover:bg-stone-50 dark:hover:bg-stone-800 focus:bg-white dark:focus:bg-stone-900 text-xs sm:text-sm text-stone-900 dark:text-stone-100 border border-stone-200/70 dark:border-stone-700 focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20 outline-none transition-all placeholder:text-stone-400 dark:placeholder:text-stone-500"
                    />
                    {searchingPhoton && (
                      <div className="absolute right-3 w-3.5 h-3.5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>

                  {/* Photon Dropdown Results */}
                  {showSearchDropdown && photonResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 z-40 max-h-56 overflow-y-auto bg-white dark:bg-[#1c1917] border border-stone-200 dark:border-stone-700 rounded-xl shadow-lg divide-y divide-stone-100 dark:divide-stone-800">
                      <div className="p-2 bg-stone-50 dark:bg-stone-800 text-[11px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
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
                          className="w-full p-2.5 text-left hover:bg-amber-50/50 dark:hover:bg-stone-800/60 flex items-start gap-2.5 transition-colors cursor-pointer"
                        >
                          <Compass className="w-4 h-4 text-amber-700 dark:text-amber-500 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">
                              {place.name}
                            </p>
                            <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
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
                <div className="flex items-center justify-between px-1 text-xs text-stone-500 dark:text-stone-400 font-medium">
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
                  <div className="p-8 text-center bg-white dark:bg-[#1c1917] rounded-2xl border border-stone-200/80 dark:border-stone-800 my-4 space-y-3 shadow-2xs">
                    <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 flex items-center justify-center mx-auto shadow-2xs">
                      <Sparkles className="w-6 h-6 text-amber-700 dark:text-amber-400" />
                    </div>

                    {spots.length === 0 ? (
                      <>
                        <h3 className="font-serif font-bold text-stone-900 dark:text-stone-100 text-base">
                          Your food & coffee map is ready!
                        </h3>
                        <p className="text-xs text-stone-500 dark:text-stone-400 max-w-xs mx-auto leading-relaxed">
                          Save your favorite café or restaurant, or zoom in on the map to discover spots around you.
                        </p>
                        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => setLogModalOpen(true)}
                            className="w-full sm:w-auto px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Save your first spot</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setMobileTab("map")}
                            className="w-full sm:w-auto px-3.5 py-2 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors border border-stone-200 dark:border-stone-700"
                          >
                            <Compass className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                            <span>Explore map</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <h3 className="font-serif font-bold text-stone-900 dark:text-stone-100 text-sm">
                          {filters.status === "wishlist"
                            ? "No spots on your Want to Try list"
                            : filters.status === "visited"
                              ? "No visited spots match this filter"
                              : "No spots match this filter"}
                        </h3>
                        <p className="text-xs text-stone-500 dark:text-stone-400 max-w-xs mx-auto leading-relaxed">
                          Try clearing your filters or save a new place you&apos;d love to remember.
                        </p>
                        <div className="pt-1 flex items-center justify-center gap-3">
                          <button
                            type="button"
                            onClick={() => setFilters(defaultFilters)}
                            className="text-xs font-bold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                          >
                            Reset filters
                          </button>
                          <span className="text-stone-300 dark:text-stone-700">·</span>
                          <button
                            type="button"
                            onClick={() => setLogModalOpen(true)}
                            className="text-xs font-semibold text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white cursor-pointer"
                          >
                            + Save a spot
                          </button>
                        </div>
                      </>
                    )}
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
      <nav className="md:hidden h-14 bg-white dark:bg-[#18181b] border-t border-stone-200/90 dark:border-stone-800 px-3 flex items-center justify-around shrink-0 z-30">
        <button
          type="button"
          onClick={() => {
            setMobileTab("map");
          }}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold cursor-pointer ${
            mobileTab === "map"
              ? "text-amber-700 dark:text-amber-400"
              : "text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200"
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
            mobileTab === "journal"
              ? "text-amber-700 dark:text-amber-400"
              : "text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200"
          }`}
        >
          <BookOpen className="w-5 h-5" />
          <span>My Journal ({spots.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setLogModalOpen(true)}
          className="flex flex-col items-center gap-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400 cursor-pointer"
        >
          <div className="w-7 h-7 rounded-full bg-amber-700 hover:bg-amber-800 text-white flex items-center justify-center shadow-xs">
            <Plus className="w-4 h-4" />
          </div>
          <span>Save Spot</span>
        </button>

        <button
          type="button"
          onClick={() => setToolsOpen(true)}
          className="flex flex-col items-center gap-0.5 text-[10px] font-bold text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 cursor-pointer"
        >
          <Folder className="w-5 h-5" />
          <span>My Lists</span>
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
