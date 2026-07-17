"use client";

import { useState, useEffect, useMemo, useRef, useCallback, memo, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type FoodSpotLog, type SpotCategory } from "./db";
import Link from "next/link";
import { makeThumbnail, compressToBlob, compressBlobToSafeBase64 } from "@/utils/image";
import SpotDetailModal from "@/components/SpotDetailModal";
import AuthGuard from "@/components/AuthGuard";
import { useAuth } from "@/lib/auth";
import {
  generateSpotId,
  writeSpotToFirestore,
  deleteSpotFromFirestore,
  subscribeToSpots,
  type FirestoreSpotChange,
  addImageToFirestore,
  deleteImagesForSpotFromFirestore,
  subscribeToImages,
} from "@/lib/firestore";
import {
  syncSpotToFirestore,
  queuePendingDelete,
  startOnlineListener,
  getPendingDeletes,
} from "@/lib/offlineSync";
import { Trash2, Camera, LogOut, ChevronLeft, ChevronRight, Clock, Plus, X, WifiOff, Cloud, CloudOff, MapPin } from "lucide-react";
import { gsap } from "gsap";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type SortMode = "newest" | "highest" | "lowest";
type CategoryFilter = "All" | SpotCategory;

/* ------------------------------------------------------------------ */
/*  Debounce hook                                                      */
/* ------------------------------------------------------------------ */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/* ------------------------------------------------------------------ */
/*  Theme toggle                                                       */
/* ------------------------------------------------------------------ */
const ThemeToggle = memo(function ThemeToggle({
  dark,
  onToggle,
}: {
  dark: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="neu-button flex h-11 w-11 items-center justify-center rounded-full text-text-secondary cursor-pointer"
    >
      {dark ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" /><path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" /><path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      )}
    </button>
  );
});

/* ------------------------------------------------------------------ */
/*  Gooey Category Selector Component                                  */
/* ------------------------------------------------------------------ */
const CategoryPills = memo(function CategoryPills({
  value,
  onChange,
}: {
  value: SpotCategory;
  onChange: (c: SpotCategory) => void;
}) {
  return (
    <div className="relative w-full overflow-hidden p-1.5 bg-bg/50 shadow-neu-inset rounded-2xl flex min-h-[50px] items-center">
      {/* Gooey filter layer for background */}
      <div className="absolute inset-0 pointer-events-none rounded-2xl overflow-hidden" style={{ filter: "url(#gooey-medium)" }}>
        <div
          className="absolute h-9 bg-accent rounded-xl transition-all duration-300 ease-out"
          style={{
            width: "calc(50% - 10px)",
            left: value === "Cafe" ? "6px" : "calc(50% + 4px)",
            top: "7px",
          }}
        />
      </div>

      {/* Actual buttons (crisp text layer above) */}
      <button
        type="button"
        onClick={() => onChange("Cafe")}
        className={`relative z-10 w-1/2 rounded-xl py-2 text-sm font-semibold transition-colors duration-300 min-h-[38px] cursor-pointer ${
          value === "Cafe" ? "text-white font-bold" : "text-text-secondary hover:text-text-primary"
        }`}
      >
        ☕ Cafe
      </button>
      <button
        type="button"
        onClick={() => onChange("Restaurant")}
        className={`relative z-10 w-1/2 rounded-xl py-2 text-sm font-semibold transition-colors duration-300 min-h-[38px] cursor-pointer ${
          value === "Restaurant" ? "text-white font-bold" : "text-text-secondary hover:text-text-primary"
        }`}
      >
        🍽️ Restaurant
      </button>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  Gooey Rating Selector Component                                    */
/* ------------------------------------------------------------------ */
const RatingPills = memo(function RatingPills({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="relative w-full p-1.5 bg-bg/50 shadow-neu-inset rounded-2xl flex justify-between items-center min-h-[52px]">
      {/* Gooey filter layer */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl" style={{ filter: "url(#gooey-rating)" }}>
        <div
          className="absolute h-9 w-9 rounded-full bg-accent transition-all duration-300 ease-out"
          style={{
            left: `calc(6px + ${(value - 1)} * (100% - 48px) / 9)`,
            top: "8px",
          }}
        />
      </div>

      {/* Numbers */}
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
        const active = n === value;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`
              relative z-10 h-9 w-9 rounded-full text-xs sm:text-sm font-bold font-mono
              transition-colors duration-300 cursor-pointer flex items-center justify-center
              ${active ? "text-white font-bold scale-105" : "text-text-secondary hover:text-text-primary"}
            `}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  Category badge (card display)                                      */
/* ------------------------------------------------------------------ */
const CategoryBadge = memo(function CategoryBadge({ category }: { category: SpotCategory }) {
  const bg = category === "Cafe" ? "bg-category-cafe" : "bg-category-restaurant";
  const label = category === "Cafe" ? "☕ Cafe" : "🍽️ Restaurant";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase text-white ${bg}`}
    >
      {label}
    </span>
  );
});

/* ------------------------------------------------------------------ */
/*  Spot card (neumorphic)                                             */
/* ------------------------------------------------------------------ */
const SpotCard = memo(function SpotCard({
  spot,
  onClick,
}: {
  spot: FoodSpotLog;
  onClick: () => void;
  index: number;
}) {
  const date = new Date(spot.createdAt);
  const formatted = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div
      className="neu-card overflow-hidden cursor-pointer flex flex-col h-full"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Thumbnail */}
      {spot.thumbnail ? (
        <div className="relative h-44 w-full overflow-hidden">
          <img
            src={spot.thumbnail}
            alt={`Photo of ${spot.name}`}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 hover:scale-110"
          />
          {/* Rating badge overlay */}
          <div className="absolute top-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-bg/90 shadow-neu-subtle font-mono text-sm font-bold text-accent backdrop-blur-sm">
            {spot.rating}
          </div>
        </div>
      ) : (
        <div className="h-28 w-full bg-bg/40 flex items-center justify-center shadow-neu-inset relative">
          <span className="text-3xl opacity-45">{spot.category === "Cafe" ? "☕" : "🍽️"}</span>
          <div className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-bg shadow-neu-subtle font-mono text-xs font-bold text-accent">
            {spot.rating}
          </div>
        </div>
      )}

      {/* Text content */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="truncate text-sm md:text-base font-sans font-semibold text-text-primary mb-1">
            {spot.name}
          </h3>

          <div className="flex flex-wrap items-center gap-2 mb-2">
            <p className="text-[10px] text-text-secondary font-mono">{formatted}</p>
            <CategoryBadge category={spot.category ?? "Restaurant"} />
          </div>

          {spot.comment && (
            <p className="text-xs sm:text-sm leading-relaxed text-text-secondary line-clamp-3">
              {spot.comment}
            </p>
          )}
        </div>
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  Pill button (neumorphic)                                           */
/* ------------------------------------------------------------------ */
const PillButton = memo(function PillButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-2.5 text-xs md:text-sm font-medium transition-all duration-300 cursor-pointer whitespace-nowrap min-h-[40px] ${
        active
          ? "shadow-neu-inset text-accent font-semibold"
          : "shadow-neu-subtle text-text-secondary hover:text-text-primary active:shadow-neu-inset"
      }`}
    >
      {label}
    </button>
  );
});

/* ------------------------------------------------------------------ */
/*  User avatar/profile button                                         */
/* ------------------------------------------------------------------ */
function UserProfile({
  photoURL,
  displayName,
  email,
  onSignOut,
}: {
  photoURL: string | null;
  displayName: string | null;
  email: string | null;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleOutsideClick(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative z-50">
      <button
        type="button"
        onClick={() => setOpen((o: boolean) => !o)}
        className="neu-button flex h-11 w-11 items-center justify-center rounded-full overflow-hidden cursor-pointer"
      >
        {photoURL ? (
          <img src={photoURL} alt={displayName ?? "User"} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="text-sm font-bold text-accent">
            {(displayName?.[0] ?? "U").toUpperCase()}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-14 w-60 rounded-2xl p-4 bg-bg/95 backdrop-blur-md border border-text-secondary/10 shadow-neu-raised animate-page-enter z-50">
          <div className="flex flex-col gap-0.5 px-1 pb-2">
            <p className="truncate text-sm font-bold text-text-primary">
              {displayName ?? "User"}
            </p>
            {email && (
              <p className="truncate text-[11px] text-text-secondary/80 font-medium">
                {email}
              </p>
            )}
          </div>
          <hr className="border-text-secondary/10 my-1" />
          <button
            type="button"
            onClick={() => {
              console.log("[KeepCheck UI] Sign-out button clicked!");
              onSignOut();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-500 transition-all duration-300 hover:bg-red-500 hover:text-white hover:border-transparent active:scale-[0.97] cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Activity Feed List Item (memoized)                                  */
/* ------------------------------------------------------------------ */
const FeedListItem = memo(function FeedListItem({
  spot,
  onSelect,
  onDelete,
}: {
  spot: FoodSpotLog;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className="feed-list-item neu-button p-4 flex items-center justify-between gap-3 text-sm cursor-pointer hover:bg-bg/85 relative transition-all"
    >
      <div className="min-w-0 flex-1 flex items-center gap-3.5">
        <span className="text-2xl flex-shrink-0">{spot.category === "Cafe" ? "☕" : "🍽️"}</span>
        <div className="min-w-0">
          <p className="font-semibold text-text-primary truncate text-base">{spot.name}</p>
          <div className="flex items-center gap-2.5 mt-1">
            <span className="text-[10px] text-text-secondary/60 font-mono flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(spot.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
            <span className="text-text-secondary/20">•</span>
            {spot.comment ? (
              <p className="text-xs text-text-secondary truncate max-w-[200px] sm:max-w-xs md:max-w-md">
                {spot.comment}
              </p>
            ) : (
              <span className="text-xs text-text-secondary/40 italic">No notes</span>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-3.5 flex-shrink-0">
        {/* Pending sync indicator in list view */}
        {spot.pendingSync && (
          <span className="pending-sync-pill" title="Pending sync">
            <CloudOff className="h-3 w-3" />
            <span className="hidden sm:inline">Offline</span>
          </span>
        )}
        <span className="font-bold font-mono text-accent text-xs bg-bg/50 shadow-neu-inset px-2.5 py-1 rounded-full">
          ★ {spot.rating}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="text-text-secondary/50 hover:text-red-500 transition-colors p-1"
          aria-label="Delete log"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */
function HomePage() {
  const { user, signOut, cachedSession } = useAuth();

  // Effective UID: use real user's UID when available, fall back to cached session
  const effectiveUid = user?.uid ?? cachedSession?.uid ?? null;

  const [name, setName] = useState("");
  const [category, setCategory] = useState<SpotCategory>("Restaurant");
  const [rating, setRating] = useState(7);
  const [comment, setComment] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());

  /* -- Online/offline state -- */
  const [isOnline, setIsOnline] = useState(true);
  const [syncToastMsg, setSyncToastMsg] = useState<string | null>(null);

  /* -- Modal control state -- */
  const [isFormOpen, setIsFormOpen] = useState(false);

  /* -- Detail modal -- */
  const [selectedSpotId, setSelectedSpotId] = useState<number | null>(null);

  /* -- Theme -- */
  const [dark, setDark] = useState(true);

  /* -- Carousel control -- */
  const carouselRef = useRef<HTMLDivElement>(null);
  const [scrollPercent, setScrollPercent] = useState(0);

  /* -- GSAP Animation Refs -- */
  const modalContainerRef = useRef<HTMLDivElement>(null);
  const modalContentRef = useRef<HTMLDivElement>(null);
  const modalGooeyBgRef = useRef<HTMLDivElement>(null);
  const backdropOverlayRef = useRef<HTMLDivElement>(null);
  const hasAnimatedRef = useRef(false);

  /* -- Search with debouncing -- */
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 150);

  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [catFilter, setCatFilter] = useState<CategoryFilter>("All");

  useEffect(() => {
    // Read stored theme preference
    try {
      const stored = localStorage.getItem("keepcheck-theme");
      if (stored) setDark(stored === "dark");
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("keepcheck-theme", dark ? "dark" : "light");
    } catch { /* ignore */ }
  }, [dark]);

  /* -- Prevent body scroll when form modal is open -- */
  useEffect(() => {
    if (isFormOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isFormOpen]);

  /* -- Storage persistence (best-effort) -- */
  useEffect(() => {
    if (navigator.storage?.persist) {
      navigator.storage.persist().then((granted) => {
        console.log(
          `[KeepCheck] Storage persistence ${granted ? "granted ✓" : "denied ✗"}`,
        );
      });
    }
  }, []);

  /* -- Image preview object URL -- */
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  /* -- Firestore real-time sync (only when online and user is available) -- */
  const syncSpots = useCallback(async (changes: FirestoreSpotChange[]) => {
    if (!user) return;

    const pendingDeletes = getPendingDeletes();

    for (const change of changes) {
      const fSpot = change.spot;

      // 3. DELETE-RESURRECTION RACE CONDITION PATCH
      // If a user deletes a spot while offline, and the app comes online, the Firestore
      // snapshot listener might re-download the document before the pending delete
      // queue processes it. Ignore incoming added/modified snapshots for flagged IDs.
      const isPendingDelete = pendingDeletes.some(
        (d) => d.uid === user.uid && d.firebaseId === fSpot.firebaseId
      );
      if (isPendingDelete) {
        console.log(`[KeepCheck] Ignoring incoming snapshot for "${fSpot.name}" (${fSpot.firebaseId}) — pending local delete`);
        continue;
      }

      if (change.type === "added" || change.type === "modified") {
        const existing = await db.spots.where("firebaseId").equals(fSpot.firebaseId).first();
        let localSpotId: number | undefined;

        if (!existing) {
          localSpotId = await db.spots.add({
            name: fSpot.name,
            category: fSpot.category ?? "Restaurant",
            rating: fSpot.rating,
            comment: fSpot.comment,
            createdAt: fSpot.createdAt,
            thumbnail: fSpot.thumbnail,
            firebaseId: fSpot.firebaseId,
            userId: user.uid,
            pendingSync: false,
            latitude: fSpot.latitude,
            longitude: fSpot.longitude,
          });
        } else if (existing.id !== undefined) {
          localSpotId = existing.id;
          // Build an update payload with only the fields that actually changed
          const updates: Partial<FoodSpotLog> = {};
          if (existing.name !== fSpot.name) updates.name = fSpot.name;
          if (existing.category !== (fSpot.category ?? "Restaurant")) updates.category = fSpot.category ?? "Restaurant";
          if (existing.rating !== fSpot.rating) updates.rating = fSpot.rating;
          if (existing.comment !== fSpot.comment) updates.comment = fSpot.comment;
          if (existing.createdAt !== fSpot.createdAt) updates.createdAt = fSpot.createdAt;
          if (existing.thumbnail !== fSpot.thumbnail) updates.thumbnail = fSpot.thumbnail;
          if (existing.latitude !== fSpot.latitude) updates.latitude = fSpot.latitude;
          if (existing.longitude !== fSpot.longitude) updates.longitude = fSpot.longitude;
          if (existing.pendingSync) updates.pendingSync = false;

          if (Object.keys(updates).length > 0) {
            await db.spots.update(existing.id, updates);
          }
        }
      } else if (change.type === "removed") {
        const existing = await db.spots.where("firebaseId").equals(fSpot.firebaseId).first();
        if (existing && existing.id !== undefined) {
          await db.images.where("spotId").equals(existing.id).delete();
          await db.spots.delete(existing.id);
        }
      }
    }
  }, [user]);

  const syncImages = useCallback(async (firestoreImages: { firebaseId: string; spotFirebaseId: string; base64: string; createdAt: number }[]) => {
    if (!user) return;

    for (const fImg of firestoreImages) {
      const spot = await db.spots.where("firebaseId").equals(fImg.spotFirebaseId).first();
      if (!spot || spot.id === undefined) continue;

      const existingImages = await db.images.where("spotId").equals(spot.id).toArray();
      const alreadyHas = existingImages.some((img) => img.firebaseId === fImg.firebaseId);
      if (alreadyHas) continue;

      try {
        const response = await fetch(fImg.base64);
        const blob = await response.blob();
        await db.images.add({
          spotId: spot.id,
          blob,
          createdAt: fImg.createdAt,
          firebaseId: fImg.firebaseId,
        });
        console.log(`[KeepCheck] Successfully downloaded and cached image for spot from base64: ${spot.name}`);
      } catch (err) {
        console.warn("[KeepCheck] Failed to sync image from Firestore:", err);
      }
    }
  }, [user]);

  // Only subscribe to Firestore when we have a real authenticated user
  useEffect(() => {
    if (!user) return;
    const unsubSpots = subscribeToSpots(user.uid, syncSpots);
    const unsubImages = subscribeToImages(user.uid, syncImages);
    return () => {
      unsubSpots();
      unsubImages();
    };
  }, [user, syncSpots, syncImages]);

  /* -- Offline sync listener -- */
  useEffect(() => {
    if (!user) return;

    const cleanup = startOnlineListener(
      user.uid,
      (online) => setIsOnline(online),
      (syncedCount) => {
        if (syncedCount > 0) {
          setSyncToastMsg(`✓ Synced ${syncedCount} offline log${syncedCount > 1 ? "s" : ""}`);
          setTimeout(() => setSyncToastMsg(null), 3500);
        }
      },
    );

    return cleanup;
  }, [user]);

  // Reactive query — uses effectiveUid so data loads from Dexie even before Firebase auth resolves
  const spots = useLiveQuery(() => {
    if (!effectiveUid) return [];
    return db.spots.where("userId").equals(effectiveUid).reverse().sortBy("createdAt");
  }, [effectiveUid]);

  /** Derived: filtered + sorted view of spots. */
  const filteredSpots = useMemo(() => {
    if (!spots) return undefined;

    const query = search.trim().toLowerCase();

    let result = spots;
    if (query) {
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.comment.toLowerCase().includes(query)
      );
    }

    if (catFilter !== "All") {
      result = result.filter(
        (s) => (s.category ?? "Restaurant") === catFilter
      );
    }

    if (sortMode === "highest") {
      result = [...result].sort((a, b) => b.rating - a.rating);
    } else if (sortMode === "lowest") {
      result = [...result].sort((a, b) => a.rating - b.rating);
    } else if (sortMode === "newest") {
      result = [...result].sort((a, b) => b.createdAt - a.createdAt);
    }

    return result;
  }, [spots, search, sortMode, catFilter]);

  /* -- Carousel scrolling listener -- */
  const handleCarouselScroll = useCallback(() => {
    if (carouselRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current;
      const totalScrollable = scrollWidth - clientWidth;
      if (totalScrollable > 0) {
        setScrollPercent((scrollLeft / totalScrollable) * 100);
      } else {
        setScrollPercent(0);
      }
    }
  }, []);

  useEffect(() => {
    const el = carouselRef.current;
    if (el) {
      el.addEventListener("scroll", handleCarouselScroll, { passive: true });
      handleCarouselScroll();
    }
    return () => el?.removeEventListener("scroll", handleCarouselScroll);
  }, [filteredSpots, handleCarouselScroll]);

  const scrollCarousel = (direction: "left" | "right") => {
    if (carouselRef.current) {
      const scrollAmount = carouselRef.current.clientWidth * 0.75;
      carouselRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  /* ------------------------------------------------------------------ */
  /*  GSAP Animation Implementation                                      */
  /* ------------------------------------------------------------------ */

  // 1. Page entrance animation timeline (Run once on mount when spots resolve)
  useEffect(() => {
    if (!effectiveUid || spots === undefined) return;

    const headerEl = document.querySelector(".gsap-header");
    const isAlreadyVisible = headerEl && window.getComputedStyle(headerEl).opacity === "1";
    if (isAlreadyVisible && hasAnimatedRef.current) return;

    hasAnimatedRef.current = true;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      if (document.querySelector(".gsap-header")) {
        tl.fromTo(
          ".gsap-header",
          { y: -40, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.7 }
        );
      }
      if (document.querySelector(".gsap-spotlight")) {
        tl.fromTo(
          ".gsap-spotlight",
          { y: 35, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.8 },
          "-=0.45"
        );
      }
      if (document.querySelector(".gsap-feed-header")) {
        tl.fromTo(
          ".gsap-feed-header",
          { y: 25, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.8 },
          "-=0.55"
        );
      }
      if (document.querySelector(".gsap-feed-filters")) {
        tl.fromTo(
          ".gsap-feed-filters",
          { y: 20, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.8 },
          "-=0.6"
        );
      }

      // Stagger carousel cards
      if (document.querySelectorAll(".carousel-card").length > 0) {
        tl.fromTo(
          ".carousel-card",
          { scale: 0.92, opacity: 0, y: 15 },
          { scale: 1, opacity: 1, y: 0, duration: 0.6, stagger: 0.07, ease: "back.out(1.15)" },
          "-=0.4"
        );
      }
    });

    return () => ctx.revert();
  }, [effectiveUid, spots]);

  // 2. Modal Form slide in/out animations
  const openFormModal = () => {
    setIsFormOpen(true);
  };

  const closeFormModal = () => {
    if (modalContentRef.current && backdropOverlayRef.current && modalGooeyBgRef.current) {
      const isMobile = window.innerWidth < 640;
      
      const tl = gsap.timeline({
        onComplete: () => {
          setIsFormOpen(false);
        }
      });

      tl.to(backdropOverlayRef.current, {
        opacity: 0,
        duration: 0.25,
        ease: "power2.in"
      })
      .to(
        modalContentRef.current,
        {
          opacity: 0,
          y: isMobile ? 30 : 15,
          duration: 0.2,
          ease: "power2.in"
        },
        "-=0.2"
      )
      .to(
        modalGooeyBgRef.current,
        {
          y: isMobile ? "100%" : 100,
          scale: isMobile ? 0.8 : 0.7,
          opacity: 0,
          duration: 0.45,
          ease: "back.in(1.2)"
        },
        "-=0.2"
      );
    } else {
      setIsFormOpen(false);
    }
  };

  // Trigger GSAP entrance when form state flips to open
  useEffect(() => {
    if (isFormOpen && modalContentRef.current && backdropOverlayRef.current && modalGooeyBgRef.current) {
      const isMobile = window.innerWidth < 640;

      // Set initial values
      gsap.set(backdropOverlayRef.current, { opacity: 0 });
      gsap.set(modalContentRef.current, {
        opacity: 0,
        y: isMobile ? 25 : 15
      });
      gsap.set(modalGooeyBgRef.current, {
        y: isMobile ? "100%" : 100,
        scale: isMobile ? 0.8 : 0.7,
        opacity: 0
      });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.to(backdropOverlayRef.current, {
        opacity: 1,
        duration: 0.3
      })
      .to(
        modalGooeyBgRef.current,
        {
          y: 0,
          scale: 1,
          opacity: 1,
          duration: 0.55,
          ease: isMobile ? "power3.out" : "back.out(1.3)"
        },
        "-=0.2"
      )
      .to(
        modalContentRef.current,
        {
          opacity: 1,
          y: 0,
          duration: 0.35,
          ease: "power2.out"
        },
        "-=0.25"
      );
    }
  }, [isFormOpen]);

  // 3. Elastic animations for FAB hover/clicks
  const handleFABHover = (enter: boolean) => {
    gsap.to(".gsap-fab", {
      scale: enter ? 1.15 : 1,
      rotation: enter ? 90 : 0,
      duration: 0.5,
      ease: "elastic.out(1, 0.4)",
      overwrite: "auto"
    });
  };

  const handleFABPress = (down: boolean) => {
    gsap.to(".gsap-fab", {
      scale: down ? 0.92 : 1.15,
      duration: 0.25,
      ease: "power2.out",
      overwrite: "auto"
    });
  };

  // Submit button success timeline
  useEffect(() => {
    if (success) {
      gsap.fromTo(
        ".gsap-success-tick",
        { scale: 0.4, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.5, ease: "elastic.out(1.1, 0.35)" }
      );
    }
  }, [success]);

  /* ---------- handlers ---------- */

interface LocationCoords {
  latitude?: number;
  longitude?: number;
}

function getCoords(): Promise<LocationCoords> {
  return new Promise((resolve) => {
    console.log("[KeepCheck Geolocation] Attempting to capture current position (timeout: 5000ms)...");

    if (typeof window === "undefined" || !navigator.geolocation) {
      console.warn("[KeepCheck Geolocation] Geolocation is not supported by this browser or environment.");
      resolve({});
      return;
    }

    let resolved = false;
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.warn("[KeepCheck Geolocation] Geolocation capture timed out after 5000ms.");
        resolve({});
      }
    }, 5000);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!resolved) {
          clearTimeout(timeoutId);
          resolved = true;
          console.log(
            `[KeepCheck Geolocation] Successfully captured position: lat=${position.coords.latitude}, lng=${position.coords.longitude} (accuracy: ${position.coords.accuracy}m)`
          );
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        }
      },
      (error) => {
        if (!resolved) {
          clearTimeout(timeoutId);
          resolved = true;
          
          let reason = "Unknown error";
          if (error.code === error.PERMISSION_DENIED) {
            reason = "Permission denied by user";
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            reason = "Position unavailable";
          } else if (error.code === error.TIMEOUT) {
            reason = "Timeout";
          }
          console.warn(
            `[KeepCheck Geolocation] Geolocation capture failed: ${reason} (code: ${error.code}, message: ${error.message})`
          );
          resolve({});
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 0,
      }
    );
  });
}

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !user) return;

    setSaving(true);

    try {
      let thumbnail: string | undefined;
      let compressedBlob: Blob | undefined;

      if (imageFile) {
        try {
          [thumbnail, compressedBlob] = await Promise.all([
            makeThumbnail(imageFile),
            compressToBlob(imageFile),
          ]);
        } catch (imgErr) {
          console.error("[KeepCheck] Image processing failed:", imgErr);
          alert(
            "Could not process this image format. Try taking a JPEG photo instead.",
          );
          setSaving(false);
          return;
        }
      }

      let coords: LocationCoords = {};
      try {
        coords = await getCoords();
      } catch (e) {
        console.error("[KeepCheck] Geolocation retrieval failed:", e);
      }

      const spotData = {
        name: trimmed,
        category,
        rating,
        comment: comment.trim(),
        createdAt: Date.now(),
        thumbnail,
        latitude: coords.latitude,
        longitude: coords.longitude,
      };

      const firebaseId = generateSpotId(user.uid);

      // ---- 1. ALWAYS save locally first (instant, works offline) ----
      const spotId = await db.transaction("rw", db.spots, db.images, async () => {
        const localId = await db.spots.add({
          ...spotData,
          firebaseId,
          userId: user.uid,
          pendingSync: true, // Assume pending until Firestore write succeeds
        });

        if (compressedBlob) {
          await db.images.add({
            spotId: localId,
            blob: compressedBlob,
            createdAt: Date.now(),
          });
        }

        return localId;
      });

      console.log(`[KeepCheck] Spot saved locally (id: ${spotId}, firebase: ${firebaseId})`);

      // ---- 2. Attempt Firestore write directly (works offline via persistentLocalCache) ----
      try {
        await writeSpotToFirestore(user.uid, firebaseId, spotData);

        // Upload image as base64 to Firestore (non-blocking, best-effort)
        if (compressedBlob) {
          try {
            const base64 = await compressBlobToSafeBase64(compressedBlob);
            if (base64) {
              const imgFirebaseId = await addImageToFirestore(user.uid, {
                spotFirebaseId: firebaseId,
                base64,
                createdAt: Date.now(),
              });
              // Mark image as synced locally
              const localImg = await db.images.where("spotId").equals(spotId).first();
              if (localImg && localImg.id !== undefined) {
                await db.images.update(localImg.id, { firebaseId: imgFirebaseId });
              }
            } else {
              console.warn("[KeepCheck] compressBlobToSafeBase64 returned null (too large). Skipping image Firestore upload, keeping only local photo.");
            }
          } catch (imgUploadErr) {
            console.warn("[KeepCheck] Image sync to Firestore failed (will retry on sync sweep):", imgUploadErr);
          }
        }

        // Firestore write succeeded (or queued by local cache) — clear pendingSync
        await db.spots.update(spotId, { pendingSync: false });
        console.log(`[KeepCheck] Spot synced to Firestore (${firebaseId})`);
      } catch (firestoreErr) {
        // Firestore write failed — pendingSync stays true, will retry when online
        console.warn("[KeepCheck] Firestore write failed — queued for sync when online:", firestoreErr);
      }

      // ---- 3. Reset form & show success ----
      setName("");
      setCategory("Restaurant");
      setRating(7);
      setComment("");
      setImageFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      
      setSuccess(true);
      
      setTimeout(() => {
        setSuccess(false);
        closeFormModal();
      }, 1200);
    } catch (err: unknown) {
      if (
        err instanceof DOMException &&
        err.name === "QuotaExceededError"
      ) {
        alert(
          "Your device is out of storage space. Free some space and try again.",
        );
      } else {
        console.error("[KeepCheck] Save failed:", err);
        alert("Something went wrong while saving. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }



  async function deleteEntry(id: number) {
    try {
      setDeletingIds((prev: Set<number>) => new Set<number>(prev).add(id));
      const spot = await db.spots.get(id);

      await new Promise((resolve) => setTimeout(resolve, 400));

      // Delete locally first (always works)
      await db.transaction("rw", db.spots, db.images, async () => {
        await db.images.where("spotId").equals(id).delete();
        await db.spots.delete(id);
      });

      // Attempt Firestore delete (non-blocking)
      if (spot?.firebaseId && user) {
        try {
          await deleteImagesForSpotFromFirestore(user.uid, spot.firebaseId);
          await deleteSpotFromFirestore(user.uid, spot.firebaseId);
        } catch (fireErr) {
          console.warn("[KeepCheck] Firestore delete failed — queued for retry when online:", fireErr);
          // Queue for retry when back online
          queuePendingDelete(user.uid, spot.firebaseId);
        }
      }

      setDeletingIds((prev: Set<number>) => {
        const next = new Set<number>(prev);
        next.delete(id);
        return next;
      });
    } catch (error) {
      console.error("Failed to delete entry:", error);
      setDeletingIds((prev: Set<number>) => {
        const next = new Set<number>(prev);
        next.delete(id);
        return next;
      });
    }
  }

  // Memoized profile props for UserProfile to avoid re-creating on every render
  const profilePhotoURL = user?.photoURL ?? cachedSession?.photoURL ?? null;
  const profileDisplayName = user?.displayName ?? cachedSession?.displayName ?? null;
  const profileEmail = user?.email ?? cachedSession?.email ?? null;

  /* ---------- render ---------- */

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-screen-lg flex-col px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      {/* ---- SVG Gooey filters ---- */}
      <svg className="absolute h-0 w-0" aria-hidden="true">
        <defs>
          <filter id="gooey-bg">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="gooey" />
            <feComposite in="SourceGraphic" in2="gooey" operator="atop" />
          </filter>
          <filter id="gooey-medium">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8" result="gooey" />
            <feComposite in="SourceGraphic" in2="gooey" operator="atop" />
          </filter>
          <filter id="gooey-rating">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 16 -6" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      {/* ---- Background blobs (GPU-contained) ---- */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden opacity-40 blob-container" style={{ filter: "url(#gooey-bg)" }}>
        <div className="animate-blob-1 absolute -top-32 -left-32 h-80 w-80 rounded-full bg-accent/10" />
        <div className="animate-blob-2 absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-category-cafe/10" />
        <div className="animate-blob-3 absolute top-1/2 left-1/3 h-56 w-56 rounded-full bg-category-restaurant/10" />
      </div>

      {/* ---- Offline Banner ---- */}
      {!isOnline && (
        <div className="offline-banner fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold">
          <WifiOff className="h-4 w-4 animate-pulse" />
          <span>You&apos;re offline — logs are saved locally and will sync when reconnected</span>
        </div>
      )}

      {/* ---- Sync Toast ---- */}
      {syncToastMsg && (
        <div className="sync-toast fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold">
          <Cloud className="h-4 w-4" />
          <span>{syncToastMsg}</span>
        </div>
      )}

      {/* ---- Header ---- */}
      <header className={`relative z-40 mb-6 sm:mb-8 gsap-header gsap-reveal ${!isOnline ? 'mt-10' : ''}`}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-serif font-bold tracking-tight text-text-primary">
              Keep<span className="text-accent">Check</span>
            </h1>
            <p className="mt-1 text-sm sm:text-base text-text-secondary">
              Track &amp; rate every café and restaurant.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/map"
              aria-label="View Map"
              className="neu-button flex h-11 w-11 items-center justify-center rounded-full text-text-secondary cursor-pointer"
            >
              <MapPin className="h-5 w-5" />
            </Link>
            <ThemeToggle dark={dark} onToggle={() => setDark((d: boolean) => !d)} />
            
            {/* Desktop Add Spot button */}
            {effectiveUid && (
              <button
                type="button"
                onClick={openFormModal}
                className="hidden md:inline-flex items-center gap-1.5 neu-button rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold text-accent cursor-pointer hover:text-accent-glow"
              >
                <Plus className="h-4 w-4" />
                Add Spot
              </button>
            )}

            {effectiveUid && (
              <UserProfile
                photoURL={profilePhotoURL}
                displayName={profileDisplayName}
                email={profileEmail}
                onSignOut={signOut}
              />
            )}
          </div>
        </div>
      </header>

      {/* ---- Spotlight Carousel ---- */}
      <section className="relative w-full mb-8 sm:mb-12 gsap-spotlight gsap-reveal">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base sm:text-lg font-serif font-semibold text-text-primary flex items-center gap-2">
            <span>✨ Spotlight Logs</span>
            {filteredSpots && filteredSpots.length > 0 && (
              <span className="text-xs font-mono font-normal text-text-secondary/60">
                ({filteredSpots.length} items)
              </span>
            )}
          </h2>

          <div className="flex items-center gap-2">
            {spots && spots.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => scrollCarousel("left")}
                  className="neu-button flex h-9 w-9 items-center justify-center rounded-full text-text-secondary cursor-pointer hover:text-accent"
                  aria-label="Scroll left"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollCarousel("right")}
                  className="neu-button flex h-9 w-9 items-center justify-center rounded-full text-text-secondary cursor-pointer hover:text-accent"
                  aria-label="Scroll right"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Carousel Window */}
        <div className="relative group rounded-3xl p-1 bg-transparent">
          {spots === undefined ? (
            <div className="py-20 text-center text-sm font-mono text-text-secondary animate-pulse neu-raised">Loading spots…</div>
          ) : spots.length === 0 ? (
            <div className="py-16 text-center neu-raised bg-bg/40 border border-dashed border-text-secondary/25">
              <div className="neu-raised bg-bg inline-flex h-20 w-20 items-center justify-center rounded-3xl mx-auto mb-4">
                <span className="text-3xl">☕</span>
              </div>
              <p className="text-sm text-text-secondary font-medium">
                No spots logged yet — add your first cafe or restaurant to get started!
              </p>
            </div>
          ) : filteredSpots && filteredSpots.length === 0 ? (
            <div className="py-16 text-center neu-raised">
              <p className="text-sm text-text-secondary">No spots match your current filters.</p>
            </div>
          ) : (
            <div className="carousel-mask overflow-hidden rounded-3xl">
              <div
                ref={carouselRef}
                className="carousel-container gap-6 py-6 px-4 scrollbar-none"
              >
                {filteredSpots && (filteredSpots as FoodSpotLog[]).map((spot: FoodSpotLog, index: number) => (
                  <div
                    key={spot.id}
                    className={`carousel-card group/item relative shrink-0 transition-transform duration-300 ${deletingIds.has(spot.id!) ? "animate-melt" : ""}`}
                  >
                    <SpotCard
                      spot={spot}
                      index={index}
                      onClick={() => spot.id !== undefined && setSelectedSpotId(spot.id)}
                    />
                    {/* Pending sync badge */}
                    {spot.pendingSync && (
                      <div className="pending-sync-badge" title="Waiting to sync to cloud">
                        <CloudOff className="h-3 w-3" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        spot.id !== undefined && deleteEntry(spot.id);
                      }}
                      className="absolute right-4 bottom-4 neu-button inline-flex h-9 w-9 items-center justify-center rounded-full text-text-secondary/70 opacity-0 group-hover/item:opacity-100 transition-opacity duration-300 hover:text-red-500 active:shadow-neu-inset cursor-pointer z-10 bg-bg"
                      aria-label="Delete entry"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Scroll Progress line indicator */}
        {filteredSpots && filteredSpots.length > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <span className="text-[9px] font-mono text-text-secondary/50 uppercase tracking-wider">START</span>
            <div className="h-1.5 w-32 rounded-full shadow-neu-inset bg-bg/50 relative overflow-hidden">
              <div
                className="absolute top-0 bottom-0 bg-accent rounded-full transition-all duration-100"
                style={{
                  left: "0",
                  width: "20px",
                  transform: `translateX(calc(${scrollPercent} * (128px - 20px) / 100))`,
                }}
              />
            </div>
            <span className="text-[9px] font-mono text-text-secondary/50 uppercase tracking-wider">END</span>
          </div>
        )}
      </section>

      {/* ---- Bottom Section: Activity Feed & Logs ---- */}
      <section className="w-full mb-16">
        
        {/* Activity feed controls header */}
        <div className="flex items-center justify-between mb-4 gsap-feed-header gsap-reveal">
          <h2 className="text-base sm:text-lg font-serif font-semibold text-text-primary">
            Activity Feed
          </h2>
        </div>

        {spots && spots.length > 0 ? (
          <div className="space-y-5">
            {/* Filter controls row */}
            <div className="neu-raised p-4 sm:p-5 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between gsap-feed-filters gsap-reveal">
              {/* Search */}
              <div className="relative flex-1">
                <svg
                  className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary/50"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  id="search-logs"
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search spots by name or notes…"
                  className="neu-input w-full pl-11 pr-4"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => setSearchInput("")}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-text-secondary/60 hover:text-accent font-bold p-1 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                <PillButton label="All" active={catFilter === "All"} onClick={() => setCatFilter("All")} />
                <PillButton label="☕ Cafe" active={catFilter === "Cafe"} onClick={() => setCatFilter("Cafe")} />
                <PillButton label="🍽️ Restaurant" active={catFilter === "Restaurant"} onClick={() => setCatFilter("Restaurant")} />

                <div className="mx-1 h-5 w-px shrink-0 bg-text-secondary/20" />

                <PillButton label="Newest" active={sortMode === "newest"} onClick={() => setSortMode("newest")} />
                <PillButton label="Highest" active={sortMode === "highest"} onClick={() => setSortMode("highest")} />
                <PillButton label="Lowest" active={sortMode === "lowest"} onClick={() => setSortMode("lowest")} />
              </div>
            </div>

            {/* Logs display */}
            {filteredSpots && filteredSpots.length === 0 ? (
              <div className="py-16 text-center neu-raised">
                <p className="text-sm text-text-secondary">No logs match your current query or filters.</p>
              </div>
            ) : (
              /* List/Table View Mode */
              <div className="neu-raised p-4 space-y-3 pt-2">
                {filteredSpots && (filteredSpots as FoodSpotLog[]).map((spot: FoodSpotLog) => (
                  <FeedListItem
                    key={spot.id}
                    spot={spot}
                    onSelect={() => spot.id !== undefined && setSelectedSpotId(spot.id)}
                    onDelete={() => spot.id !== undefined && deleteEntry(spot.id)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="py-12 text-center neu-raised">
            <p className="text-sm text-text-secondary">Your logs feed will display here once you add a spot.</p>
          </div>
        )}
      </section>

      {/* ---- Form Modal Overlay ---- */}
      {isFormOpen && (
        <div
          ref={modalContainerRef}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Log new food spot"
        >
          {/* Backdrop Overlay */}
          <div
            ref={backdropOverlayRef}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm shadow-[0_0_8px_rgba(0,0,0,0.4)]"
            onClick={closeFormModal}
          />

          {/* Localized SVG filter for gooey modal container background */}
          <svg className="absolute h-0 w-0" aria-hidden="true">
            <defs>
              <filter id="gooey-modal">
                <feGaussianBlur in="SourceGraphic" stdDeviation="15" result="blur" />
                <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 28 -10" result="gooey" />
                <feComposite in="SourceGraphic" in2="gooey" operator="atop" />
              </filter>
            </defs>
          </svg>

          {/* Sibling Layer 1: Gooey Background canvas */}
          <div
            className="absolute inset-0 pointer-events-none flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden"
            style={{ filter: "url(#gooey-modal)" }}
          >
            {/* The liquid background block */}
            <div
              ref={modalGooeyBgRef}
              className="w-full sm:max-w-md h-[92dvh] sm:h-[630px] rounded-t-[40px] sm:rounded-[40px] bg-bg relative"
              style={{
                boxShadow: "0 -3px 0 0 var(--accent)",
                transformOrigin: "bottom center"
              }}
            >
              {/* Extra floating liquid drops inside gooey layer to trigger organic morphing on open/close */}
              <div className="absolute -top-6 left-1/4 w-8 h-8 rounded-full bg-accent opacity-20" />
              <div className="absolute -top-4 right-1/3 w-6 h-6 rounded-full bg-accent opacity-30" />
            </div>
          </div>

          {/* Sibling Layer 2: Clean Crisp Form Content */}
          <div
            ref={modalContentRef}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 overflow-y-auto max-h-[92dvh] sm:max-h-[85dvh] relative flex flex-col z-10 bg-transparent"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4 border-b border-text-secondary/10 pb-2.5">
              <h3 className="text-base sm:text-lg font-serif font-bold text-text-primary">
                Log a Food Spot
              </h3>
              <button
                type="button"
                onClick={closeFormModal}
                className="neu-button flex h-8 w-8 items-center justify-center rounded-full text-text-secondary cursor-pointer hover:text-red-500"
                aria-label="Close form"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Business Name */}
              <div>
                <label
                  htmlFor="spot-name"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-text-secondary"
                >
                  Business / Spot Name
                </label>
                <input
                  id="spot-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sam's Cafe, Shake Shack…"
                  className="neu-input w-full"
                />
              </div>

              {/* Category selector */}
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Category
                </p>
                <CategoryPills value={category} onChange={setCategory} />
              </div>

              {/* Rating selector */}
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary flex justify-between">
                  <span>Rating</span>
                  <span className="font-mono text-accent">({rating} / 10)</span>
                </p>
                <RatingPills value={rating} onChange={setRating} />
              </div>

              {/* Comments textarea */}
              <div>
                <label
                  htmlFor="spot-comment"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-text-secondary"
                >
                  Comments
                </label>
                <textarea
                  id="spot-comment"
                  rows={4}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Notes on experience, cost, or delicious dishes…"
                  className="neu-input w-full resize-none"
                />
              </div>

              {/* Photo Area */}
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Photo <span className="text-[10px] text-text-secondary/50 lowercase font-normal">(optional)</span>
                </p>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    if (e.dataTransfer.files?.[0]) {
                      setImageFile(e.dataTransfer.files[0]);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`
                    upload-dropzone p-4 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 min-h-[100px]
                    ${dragActive ? "active-drop animate-pulse-border" : ""}
                    ${imageFile ? "border-accent/40 bg-accent/5" : "border-text-secondary/25"}
                  `}
                >
                  <Camera className={`h-5 w-5 mb-1 ${imageFile ? "text-accent" : "text-text-secondary/60"}`} />
                  <p className="text-xs font-bold text-text-primary">
                    {imageFile ? "Change Photo" : "Upload or Drop Image"}
                  </p>
                  <p className="text-[10px] text-text-secondary/45 mt-0.5">
                    Max 1MB JPEG/PNG
                  </p>
                  <input
                    ref={fileInputRef}
                    id="spot-photo"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                    className="sr-only"
                  />
                </div>

                {previewUrl && (
                  <div className="relative mt-3 inline-block animate-liquid-pop">
                    <img
                      src={previewUrl}
                      alt="Selected photo preview"
                      className="h-16 w-16 rounded-2xl object-cover shadow-neu-subtle p-1 bg-bg border border-accent/20"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setImageFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white text-[9px] shadow hover:scale-110 active:scale-90 transition-all cursor-pointer border border-bg"
                      aria-label="Remove photo"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={saving || !name.trim() || success}
                className={`
                  w-full rounded-2xl py-3 text-sm sm:text-base font-semibold text-white
                  transition-all duration-300 cursor-pointer min-h-[44px] flex items-center justify-center gap-2
                  ${success
                    ? "bg-green-600 shadow-neu-inset scale-[0.98]"
                    : "bg-accent shadow-neu-button hover:shadow-neu-raised active:shadow-neu-inset"
                  }
                  disabled:opacity-40
                `}
              >
                {saving ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                    Saving...
                  </>
                ) : success ? (
                  <span className="gsap-success-tick flex items-center gap-1 font-bold">
                    ✓ Saved!
                  </span>
                ) : (
                  "Log Spot"
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ---- Floating Action Button (FAB) ---- */}
      {effectiveUid && (
        <button
          type="button"
          onClick={openFormModal}
          onMouseEnter={() => handleFABHover(true)}
          onMouseLeave={() => handleFABHover(false)}
          onMouseDown={() => handleFABPress(true)}
          onMouseUp={() => handleFABPress(false)}
          className="gsap-fab fixed bottom-6 right-6 z-40 neu-button h-14 w-14 rounded-full bg-accent text-white flex items-center justify-center shadow-lg cursor-pointer transition-all duration-300 group md:hidden"
          aria-label="Add new spot"
        >
          <Plus className="h-6 w-6 text-white" />
        </button>
      )}

      {/* ---- Detail modal ---- */}
      {selectedSpotId !== null && (
        <SpotDetailModal
          spotId={selectedSpotId}
          onClose={() => setSelectedSpotId(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Export with AuthGuard wrapper                                       */
/* ------------------------------------------------------------------ */
export default function Home() {
  return (
    <AuthGuard>
      <HomePage />
    </AuthGuard>
  );
}
