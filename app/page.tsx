"use client";

import { useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type FoodSpotLog } from "./db";

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
            ${
              n === value
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
          <p className="mt-0.5 text-xs text-zinc-400">{formatted}</p>
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
/*  Main page                                                          */
/* ------------------------------------------------------------------ */
export default function Home() {
  const [name, setName] = useState("");
  const [rating, setRating] = useState(7);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  // Reactive query – re-renders whenever `spots` table changes
  const spots = useLiveQuery(() =>
    db.spots.orderBy("createdAt").reverse().toArray()
  );

  /* ---------- handlers ---------- */

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setSaving(true);
    await db.spots.add({
      name: trimmed,
      rating,
      comment: comment.trim(),
      createdAt: Date.now(),
    });

    setName("");
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
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
          Keep<span className="text-emerald-600 dark:text-emerald-400">Check</span>
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Track &amp; rate every café, restaurant, food truck &amp; bakery.
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
          placeholder="e.g. Blue Bottle Coffee, Kogi BBQ Truck…"
          className="mb-5 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-1 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-600"
        />

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
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Your Logs
            {spots && spots.length > 0 && (
              <span className="ml-2 text-sm font-normal text-zinc-400">
                ({spots.length})
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

        {spots === undefined && (
          <p className="py-12 text-center text-sm text-zinc-400">Loading…</p>
        )}

        {spots && spots.length === 0 && (
          <p className="py-12 text-center text-sm text-zinc-400">
            No spots logged yet — add your first one above!
          </p>
        )}

        {spots && spots.length > 0 && (
          <div className="flex flex-col gap-3 overflow-y-auto pb-6">
            {spots.map((spot) => (
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
