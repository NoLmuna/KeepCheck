"use client";

import { useState, useEffect, useMemo, useRef, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type FoodSpotLog, type SpotCategory } from "./db";
import { makeThumbnail, compressToBlob } from "@/utils/image";
import SpotDetailModal from "@/components/SpotDetailModal";
import { Trash2, Camera } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type SortMode = "newest" | "highest" | "lowest";
type CategoryFilter = "All" | SpotCategory;

/* ------------------------------------------------------------------ */
/*  Theme toggle                                                       */
/* ------------------------------------------------------------------ */
function ThemeToggle({
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
      className="flex h-11 w-11 items-center justify-center rounded-full border border-text-secondary/20 bg-surface text-text-secondary shadow-sm transition-all hover:bg-bg active:scale-95 cursor-pointer"
    >
      {dark ? (
        /* Sun icon */
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </svg>
      ) : (
        /* Moon icon */
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Rating pill component                                              */
/* ------------------------------------------------------------------ */
function RatingPills({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`
            h-11 w-11 rounded-full text-sm font-bold font-mono
            transition-all duration-150 cursor-pointer
            ${n === value
              ? "bg-accent text-white shadow-md scale-110"
              : "bg-bg text-text-secondary hover:opacity-80 active:opacity-60"
            }
          `}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Category pill selector (form)                                      */
/* ------------------------------------------------------------------ */
const CATEGORIES: SpotCategory[] = ["Cafe", "Restaurant"];

function CategoryPills({
  value,
  onChange,
}: {
  value: SpotCategory;
  onChange: (c: SpotCategory) => void;
}) {
  return (
    <div className="flex gap-2">
      {CATEGORIES.map((cat) => {
        const active = cat === value;
        const colors: Record<SpotCategory, { active: string; idle: string }> = {
          Cafe: {
            active: "bg-category-cafe text-white shadow-md",
            idle: "bg-bg text-text-secondary hover:opacity-85",
          },
          Restaurant: {
            active: "bg-category-restaurant text-white shadow-md",
            idle: "bg-bg text-text-secondary hover:opacity-85",
          },
        };
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onChange(cat)}
            className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-150 cursor-pointer min-h-[44px] ${active ? colors[cat].active : colors[cat].idle
              }`}
          >
            {cat === "Cafe" ? "☕ Cafe" : "🍽️ Restaurant"}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Category badge (card display - sticker treatment)                  */
/* ------------------------------------------------------------------ */
function CategoryBadge({ category, seed = 0 }: { category: SpotCategory; seed?: number }) {
  const styles: Record<SpotCategory, string> = {
    Cafe: "bg-category-cafe text-white",
    Restaurant: "bg-category-restaurant text-white",
  };
  const label = category === "Cafe" ? "☕ Cafe" : "🍽️ Restaurant";
  const rotation = seed % 2 === 0 ? "rotate-2" : "-rotate-2";

  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase font-sans shadow-sm ${styles[category]} ${rotation}`}
    >
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Spot card (feed entry)                                             */
/* ------------------------------------------------------------------ */
function SpotCard({
  spot,
  onClick,
}: {
  spot: FoodSpotLog;
  onClick: () => void;
}) {
  const date = new Date(spot.createdAt);
  const formatted = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const seed = spot.id ?? 0;
  const rotation = (seed * 7) % 17 - 8;
  const categoryColorClass = (spot.category ?? "Restaurant") === "Cafe"
    ? "border-category-cafe text-category-cafe"
    : "border-category-restaurant text-category-restaurant";

  return (
    <div
      className="relative border-t-2 border-dashed border-text-secondary/30 border-x border-b border-text-secondary/15 bg-surface rounded-b-xl rounded-t-none shadow-sm transition-shadow hover:shadow-md h-full cursor-pointer flex flex-col"
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
      {/* Stamp rating badge */}
      <div
        style={{ transform: `rotate(${rotation}deg)` }}
        className={`absolute -top-3 -right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border-2 bg-surface font-mono text-base font-bold shadow-md ${categoryColorClass}`}
      >
        {spot.rating}
      </div>

      {/* Thumbnail */}
      {spot.thumbnail && (
        <div className="relative h-48 w-full overflow-hidden bg-bg rounded-t-none">
          <img
            src={spot.thumbnail}
            alt={`Photo of ${spot.name}`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      )}

      {/* Text content */}
      <div className="p-4 md:p-5 pr-14 md:pr-14 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm md:text-base font-sans font-semibold text-text-primary">
                {spot.name}
              </h3>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <p className="text-xs text-text-secondary font-mono">{formatted}</p>
                <CategoryBadge category={spot.category ?? "Restaurant"} seed={seed} />
              </div>
            </div>
          </div>
          {spot.comment && (
            <p className="mt-2.5 text-sm leading-relaxed text-text-secondary">
              {spot.comment}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pill button (reused for sort + category filter)                    */
/* ------------------------------------------------------------------ */
function PillButton({
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
      className={`rounded-lg px-3.5 py-2.5 text-xs md:text-sm font-medium transition-all cursor-pointer whitespace-nowrap min-h-[44px] ${
        active
          ? "bg-accent text-white shadow-sm"
          : "bg-surface text-text-secondary border border-text-secondary/15 hover:opacity-85 active:scale-95"
      }`}
    >
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */
export default function Home() {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<SpotCategory>("Restaurant");
  const [rating, setRating] = useState(7);
  const [comment, setComment] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* -- Detail modal -- */
  const [selectedSpotId, setSelectedSpotId] = useState<number | null>(null);

  /* -- Theme -- */
  const [dark, setDark] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

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

  /* -- Image preview object URL (raw file, NOT compressed) -- */
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

  /* -- Search, Sort & Category filter -- */
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [catFilter, setCatFilter] = useState<CategoryFilter>("All");

  // Reactive query – re-renders whenever `spots` table changes
  const spots = useLiveQuery(() =>
    db.spots.orderBy("createdAt").reverse().toArray()
  );

  /** Derived: filtered + sorted view of spots. */
  const filteredSpots = useMemo(() => {
    if (!spots) return undefined;

    const query = search.trim().toLowerCase();

    // Filter by search text
    let result = spots;
    if (query) {
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.comment.toLowerCase().includes(query)
      );
    }

    // Filter by category
    if (catFilter !== "All") {
      result = result.filter(
        (s) => (s.category ?? "Restaurant") === catFilter
      );
    }

    // Sort
    if (sortMode === "highest") {
      result = [...result].sort((a, b) => b.rating - a.rating);
    } else if (sortMode === "lowest") {
      result = [...result].sort((a, b) => a.rating - b.rating);
    }
    // "newest" is the default order from the query (createdAt desc)

    return result;
  }, [spots, search, sortMode, catFilter]);

  /* ---------- handlers ---------- */

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setSaving(true);

    try {
      // Compress image in parallel (if present) before opening the txn.
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

      // Dual-write transaction — keeps `spots` and `images` in sync.
      await db.transaction("rw", db.spots, db.images, async () => {
        const spotId = await db.spots.add({
          name: trimmed,
          category,
          rating,
          comment: comment.trim(),
          createdAt: Date.now(),
          thumbnail,
        });

        if (compressedBlob) {
          await db.images.add({
            spotId,
            blob: compressedBlob,
            createdAt: Date.now(),
          });
        }
      });

      // Reset form
      setName("");
      setCategory("Restaurant");
      setRating(7);
      setComment("");
      setImageFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: unknown) {
      // Handle quota exceeded (phone out of disk space).
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

  async function handleExport() {
    const allSpots = await db.spots.toArray();
    const json = JSON.stringify(allSpots, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "keepcheck-spots-backup.json";
    a.click();

    URL.revokeObjectURL(url);
  }

  /** Cascade delete: remove associated images THEN the spot record. */
  async function deleteEntry(id: number) {
    try {
      await db.transaction("rw", db.spots, db.images, async () => {
        await db.images.where("spotId").equals(id).delete();
        await db.spots.delete(id);
      });
    } catch (error) {
      console.error("Failed to delete entry:", error);
      alert("Could not delete the entry. Please try again.");
    }
  }

  /* ---------- render ---------- */

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-screen-lg flex-col px-4 sm:px-6 lg:px-8 py-6 sm:py-10 lg:py-16">
      {/* ---- Header ---- */}
      <header className="relative mb-6 sm:mb-8 text-center">
        {/* Theme toggle — top-right */}
        <div className="absolute right-0 top-0">
          <ThemeToggle dark={dark} onToggle={() => setDark((d) => !d)} />
        </div>

        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-serif font-bold tracking-tight text-text-primary">
          Keep<span className="text-accent">Check</span>
        </h1>
        <p className="mt-1 text-sm sm:text-base text-text-secondary">
          Track &amp; rate every café and restaurant.
        </p>
      </header>

      {/* ---- Form ---- */}
      <form
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-lg mb-8 sm:mb-10 rounded-2xl border border-text-secondary/15 bg-surface p-4 sm:p-5 shadow-sm"
      >
        {/* Name */}
        <label
          htmlFor="spot-name"
          className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-secondary"
        >
          Business / Spot Name
        </label>
        <input
          id="spot-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Starbucks, Samgyupsal…"
          className="mb-5 w-full rounded-lg border border-text-secondary/20 bg-bg px-3 py-3 text-sm sm:text-base text-text-primary outline-none transition-colors placeholder:text-text-secondary/40 focus:border-accent focus:ring-1 focus:ring-accent"
        />

        {/* Category */}
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-secondary">
          Category
        </p>
        <div className="mb-5">
          <CategoryPills value={category} onChange={setCategory} />
        </div>

        {/* Rating */}
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-secondary">
          Rating&ensp;
          <span className="normal-case tracking-normal text-text-secondary/60">
            ({rating} / 10)
          </span>
        </p>
        <div className="mb-5">
          <RatingPills value={rating} onChange={setRating} />
        </div>

        {/* Comment */}
        <label
          htmlFor="spot-comment"
          className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-secondary"
        >
          Comment
        </label>
        <textarea
          id="spot-comment"
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Notes about the food, drink, vibe, or service…"
          className="mb-5 w-full resize-none rounded-lg border border-text-secondary/20 bg-bg px-3 py-3 text-sm sm:text-base text-text-primary outline-none transition-colors placeholder:text-text-secondary/40 focus:border-accent focus:ring-1 focus:ring-accent"
        />

        {/* Photo upload */}
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-secondary">
          Photo{" "}
          <span className="normal-case tracking-normal text-text-secondary/60">
            (optional)
          </span>
        </p>

        <div className="mb-5">
          {/* Custom file button */}
          <label
            htmlFor="spot-photo"
            className="inline-flex items-center gap-2 rounded-lg border border-text-secondary/20 bg-bg px-4 py-3 text-sm font-medium text-text-secondary transition-all hover:opacity-85 cursor-pointer min-h-[44px]"
          >
            <Camera className="h-4 w-4" />
            {imageFile ? "Change Photo" : "Take or Choose Photo"}
          </label>
          <input
            ref={fileInputRef}
            id="spot-photo"
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            className="sr-only"
          />

          {/* Preview strip — uses raw object URL, NOT makeThumbnail() */}
          {previewUrl && (
            <div className="relative mt-3 inline-block">
              <img
                src={previewUrl}
                alt="Selected photo preview"
                className="h-24 w-24 rounded-lg object-cover border border-text-secondary/20"
              />
              <button
                type="button"
                onClick={() => {
                  setImageFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white text-xs shadow-md hover:opacity-90 transition-colors cursor-pointer"
                aria-label="Remove photo"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="w-full rounded-lg bg-accent py-3 text-sm sm:text-base font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-40 cursor-pointer min-h-[44px]"
        >
          {saving ? "Saving…" : "Log Spot"}
        </button>
      </form>

      {/* ---- Feed ---- */}
      <section className="flex flex-1 flex-col">
        {/* Title + Export */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base sm:text-lg font-serif font-semibold text-text-primary">
            Your Logs
            {spots && spots.length > 0 && (
              <span className="ml-2 text-sm font-mono font-normal text-text-secondary">
                ({filteredSpots ? filteredSpots.length : spots.length})
              </span>
            )}
          </h2>

          {spots && spots.length > 0 && (
            <button
              type="button"
              onClick={handleExport}
              className="rounded-lg border border-text-secondary/20 bg-surface px-3.5 py-2.5 text-xs sm:text-sm font-medium text-text-secondary transition-all hover:bg-bg active:scale-95 cursor-pointer min-h-[44px]"
            >
              Export Backup
            </button>
          )}
        </div>

        {/* ---- Control bar: Search + Category + Sort ---- */}
        {spots && spots.length > 0 && (
          <div className="mb-4 sm:mb-5 flex flex-col gap-3">
            {/* Search */}
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary/50"
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
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search spots or comments…"
                className="w-full rounded-lg border border-text-secondary/20 bg-surface py-3 pl-10 pr-3 text-sm sm:text-base text-text-primary outline-none transition-colors placeholder:text-text-secondary/40 focus:border-accent focus:ring-1 focus:ring-accent min-h-[44px]"
              />
            </div>

            {/* Category filter + Sort buttons — scrollable row on mobile */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mb-1 scrollbar-none">
              {/* Category filter */}
              <PillButton
                label="All"
                active={catFilter === "All"}
                onClick={() => setCatFilter("All")}
              />
              <PillButton
                label="☕ Cafe"
                active={catFilter === "Cafe"}
                onClick={() => setCatFilter("Cafe")}
              />
              <PillButton
                label="🍽️ Restaurant"
                active={catFilter === "Restaurant"}
                onClick={() => setCatFilter("Restaurant")}
              />

              {/* Divider */}
              <div className="mx-1 h-5 w-px shrink-0 bg-text-secondary/20" />

              {/* Sort */}
              <PillButton
                label="Newest"
                active={sortMode === "newest"}
                onClick={() => setSortMode("newest")}
              />
              <PillButton
                label="Highest"
                active={sortMode === "highest"}
                onClick={() => setSortMode("highest")}
              />
              <PillButton
                label="Lowest"
                active={sortMode === "lowest"}
                onClick={() => setSortMode("lowest")}
              />
            </div>
          </div>
        )}

        {/* ---- Feed content ---- */}
        {spots === undefined && (
          <p className="py-12 text-center text-sm font-mono text-text-secondary animate-pulse">Loading…</p>
        )}

        {spots && spots.length === 0 && (
          <p className="py-12 text-center text-sm text-text-secondary">
            No spots logged yet — add your first one above!
          </p>
        )}

        {filteredSpots && filteredSpots.length === 0 && spots && spots.length > 0 && (
          <p className="py-12 text-center text-sm text-text-secondary">
            No logs match your current filters.
          </p>
        )}

        {filteredSpots && filteredSpots.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 pb-6 pt-3">
            {filteredSpots.map((spot) => (
              <div key={spot.id} className="group relative">
                <SpotCard
                  spot={spot}
                  onClick={() =>
                    spot.id !== undefined && setSelectedSpotId(spot.id)
                  }
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    spot.id !== undefined && deleteEntry(spot.id);
                  }}
                  className="absolute right-3 bottom-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface border border-text-secondary/15 text-text-secondary/70 opacity-60 transition-all hover:opacity-100 hover:bg-red-50 hover:text-red-600 active:scale-95 active:opacity-100 active:bg-red-100 dark:bg-surface dark:text-text-secondary/70 dark:hover:bg-red-950/30 dark:hover:text-red-400 cursor-pointer backdrop-blur-sm shadow-sm z-10"
                  aria-label="Delete entry"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

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
