"use client";

import { useState, useEffect, useMemo, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type FoodSpotLog, type SpotCategory } from "./db";

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
      className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 cursor-pointer"
    >
      {dark ? (
        /* Sun icon */
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
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
          width="18"
          height="18"
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
            h-9 w-9 rounded-full text-sm font-semibold
            transition-all duration-150 cursor-pointer
            ${n === value
              ? "bg-black text-white shadow-lg scale-110 dark:bg-white dark:text-black"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
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
            active:
              "bg-violet-600 text-white shadow-lg dark:bg-violet-400 dark:text-black",
            idle: "bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-900/30 dark:text-violet-300 dark:hover:bg-violet-900/50",
          },
          Restaurant: {
            active:
              "bg-sky-600 text-white shadow-lg dark:bg-sky-400 dark:text-black",
            idle: "bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-300 dark:hover:bg-sky-900/50",
          },
        };
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onChange(cat)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-all duration-150 cursor-pointer ${active ? colors[cat].active : colors[cat].idle
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
/*  Category badge (card display)                                      */
/* ------------------------------------------------------------------ */
function CategoryBadge({ category }: { category: SpotCategory }) {
  const styles: Record<SpotCategory, string> = {
    Cafe: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    Restaurant: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  };
  const label = category === "Cafe" ? "☕ Cafe" : "🍽️ Restaurant";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles[category]}`}
    >
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Spot card (feed entry)                                             */
/* ------------------------------------------------------------------ */
function SpotCard({ spot }: { spot: FoodSpotLog }) {
  const date = new Date(spot.createdAt);
  const formatted = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  /** Colour mapped from 1–10 rating. */
  const badgeColor =
    spot.rating >= 8
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
      : spot.rating >= 5
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
        : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {spot.name}
          </h3>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-xs text-zinc-400">{formatted}</p>
            <CategoryBadge category={spot.category ?? "Restaurant"} />
          </div>
        </div>
        <span
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${badgeColor}`}
        >
          {spot.rating}
        </span>
      </div>
      {spot.comment && (
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {spot.comment}
        </p>
      )}
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
      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${active
        ? "bg-black text-white dark:bg-white dark:text-black"
        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
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
  const [saving, setSaving] = useState(false);

  /* -- Theme -- */
  const [dark, setDark] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

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
    await db.spots.add({
      name: trimmed,
      category,
      rating,
      comment: comment.trim(),
      createdAt: Date.now(),
    });

    setName("");
    setCategory("Restaurant");
    setRating(7);
    setComment("");
    setSaving(false);
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

  async function handleDelete(id: number) {
    await db.spots.delete(id);
  }

  /* ---------- render ---------- */

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-10 sm:py-16">
      {/* ---- Header ---- */}
      <header className="relative mb-8 text-center">
        {/* Theme toggle — top-right */}
        <div className="absolute right-0 top-0">
          <ThemeToggle dark={dark} onToggle={() => setDark((d) => !d)} />
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
          Keep<span className="text-emerald-600 dark:text-emerald-400">Check</span>
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Track &amp; rate every café and restaurant.
        </p>
      </header>

      {/* ---- Form ---- */}
      <form
        onSubmit={handleSubmit}
        className="mb-10 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        {/* Name */}
        <label
          htmlFor="spot-name"
          className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
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
          className="mb-5 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-1 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-600"
        />

        {/* Category */}
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Category
        </p>
        <div className="mb-5">
          <CategoryPills value={category} onChange={setCategory} />
        </div>

        {/* Rating */}
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Rating&ensp;
          <span className="normal-case tracking-normal text-zinc-400 dark:text-zinc-500">
            ({rating} / 10)
          </span>
        </p>
        <div className="mb-5">
          <RatingPills value={rating} onChange={setRating} />
        </div>

        {/* Comment */}
        <label
          htmlFor="spot-comment"
          className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
        >
          Comment
        </label>
        <textarea
          id="spot-comment"
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Notes about the food, drink, vibe, or service…"
          className="mb-5 w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-1 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-600"
        />

        {/* Submit */}
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="w-full rounded-lg bg-black py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 dark:bg-white dark:text-black cursor-pointer"
        >
          {saving ? "Saving…" : "Log Spot"}
        </button>
      </form>

      {/* ---- Feed ---- */}
      <section className="flex flex-1 flex-col">
        {/* Title + Export */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Your Logs
            {spots && spots.length > 0 && (
              <span className="ml-2 text-sm font-normal text-zinc-400">
                ({filteredSpots ? filteredSpots.length : spots.length})
              </span>
            )}
          </h2>

          {spots && spots.length > 0 && (
            <button
              type="button"
              onClick={handleExport}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 cursor-pointer"
            >
              Export Backup
            </button>
          )}
        </div>

        {/* ---- Control bar: Search + Category + Sort ---- */}
        {spots && spots.length > 0 && (
          <div className="mb-4 flex flex-col gap-3">
            {/* Search */}
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
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
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-3 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-1 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-600"
              />
            </div>

            {/* Category filter + Sort buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
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
              <div className="mx-1 h-5 w-px bg-zinc-200 dark:bg-zinc-700" />

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
          <p className="py-12 text-center text-sm text-zinc-400">Loading…</p>
        )}

        {spots && spots.length === 0 && (
          <p className="py-12 text-center text-sm text-zinc-400">
            No spots logged yet — add your first one above!
          </p>
        )}

        {filteredSpots && filteredSpots.length === 0 && spots && spots.length > 0 && (
          <p className="py-12 text-center text-sm text-zinc-400">
            No logs match your current filters.
          </p>
        )}

        {filteredSpots && filteredSpots.length > 0 && (
          <div className="flex flex-col gap-3 overflow-y-auto pb-6">
            {filteredSpots.map((spot) => (
              <div key={spot.id} className="group relative">
                <SpotCard spot={spot} />
                <button
                  type="button"
                  onClick={() => spot.id !== undefined && handleDelete(spot.id)}
                  className="absolute right-2 top-2 hidden h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-xs text-zinc-400 transition-colors hover:bg-red-100 hover:text-red-600 group-hover:inline-flex dark:bg-zinc-800 dark:text-zinc-500 dark:hover:bg-red-900/30 dark:hover:text-red-400 cursor-pointer"
                  aria-label="Delete log"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
