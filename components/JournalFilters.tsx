"use client";

import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal, Sparkles, RotateCcw } from "lucide-react";
import { defaultFilters } from "@/lib/journal";
import { vibeTags, type SpotCollection } from "@/lib/models";
import type { Filters } from "@/lib/journal";

export default function JournalFilters({
  value,
  onChange,
  collections,
  hasGps,
  onPick,
  canPick,
}: {
  value: Filters;
  onChange: (f: Filters) => void;
  collections: SpotCollection[];
  hasGps: boolean;
  onPick: () => void;
  canPick: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  const count =
    Number(value.category !== "all") +
    value.vibes.length +
    Number(value.budget !== "all") +
    Number(value.distance > 0) +
    Number(value.collection !== "all") +
    Number(value.sort !== "recent");

  const update = (patch: Partial<Filters>) => onChange({ ...value, ...patch });

  return (
    <div
      ref={root}
      className="relative filter-root inline-block"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label="Filters & Decide"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`h-10 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
          count > 0 || open
            ? "bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 shadow-xs"
            : "bg-white dark:bg-[#1c1917] text-stone-700 dark:text-stone-300 border-stone-200/90 dark:border-stone-700 hover:border-amber-300 dark:hover:border-amber-600 hover:bg-stone-50 dark:hover:bg-stone-800"
        }`}
      >
        <SlidersHorizontal className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
        <span>Filters</span>
        {count > 0 && (
          <span className="w-4 h-4 rounded-full bg-amber-600 text-white text-[10px] font-bold flex items-center justify-center">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute left-0 sm:right-0 sm:left-auto top-full mt-2 z-50 w-[320px] max-w-[calc(100vw-32px)] bg-white dark:bg-[#1c1917] border border-stone-200 dark:border-stone-800 rounded-2xl shadow-xl p-4 space-y-3.5 text-stone-900 dark:text-stone-100"
          role="region"
          aria-label="Filters & Decide"
        >
          <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
            <h4 className="font-serif font-bold text-sm text-stone-900 dark:text-stone-100">
              Filter Spots
            </h4>
            {count > 0 && (
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...defaultFilters,
                    status: value.status,
                    query: value.query,
                  })
                }
                className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400 mb-1">
                Category
              </label>
              <select
                aria-label="Filter category"
                value={value.category}
                onChange={(e) => update({ category: e.target.value })}
                className="w-full h-9 px-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs text-stone-800 dark:text-stone-200 outline-none focus:border-amber-600"
              >
                <option value="all">All categories</option>
                {["coffee", "restaurant", "bakery", "bar", "other"].map((v) => (
                  <option key={v} value={v}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400 mb-1">
                Budget
              </label>
              <select
                aria-label="Filter budget"
                value={value.budget}
                onChange={(e) => update({ budget: e.target.value })}
                className="w-full h-9 px-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs text-stone-800 dark:text-stone-200 outline-none focus:border-amber-600"
              >
                <option value="all">Any budget</option>
                {["₱", "₱₱", "₱₱₱"].map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400 mb-1">
                Distance
              </label>
              <select
                aria-label="Maximum distance"
                value={value.distance}
                onChange={(e) => update({ distance: Number(e.target.value) })}
                className="w-full h-9 px-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs text-stone-800 dark:text-stone-200 outline-none focus:border-amber-600"
              >
                <option value={0}>Any distance</option>
                <option disabled={!hasGps} value={1000}>
                  Within 1 km
                </option>
                <option disabled={!hasGps} value={3000}>
                  Within 3 km
                </option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400 mb-1">
                Sort Order
              </label>
              <select
                aria-label="Sort saved spots"
                value={value.sort}
                onChange={(e) => update({ sort: e.target.value })}
                className="w-full h-9 px-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs text-stone-800 dark:text-stone-200 outline-none focus:border-amber-600"
              >
                <option value="recent">Recently Visited</option>
                <option value="rating">Highest Rated</option>
                <option value="nearest" disabled={!hasGps}>
                  Nearest to Me
                </option>
              </select>
            </div>
          </div>

          {collections.length > 0 && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400 mb-1">
                Collection
              </label>
              <select
                aria-label="Filter collection"
                value={value.collection}
                onChange={(e) => update({ collection: e.target.value })}
                className="w-full h-9 px-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs text-stone-800 dark:text-stone-200 outline-none focus:border-amber-600"
              >
                <option value="all">All collections</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Vibe Chips */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400 mb-1.5">
              Vibes & Tags
            </label>
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              {vibeTags.map((v) => {
                const active = value.vibes.includes(v);
                return (
                  <button
                    key={v}
                    type="button"
                    aria-label={`Filter ${v.replaceAll("-", " ")}`}
                    aria-pressed={active}
                    onClick={() =>
                      update({
                        vibes: active
                          ? value.vibes.filter((x) => x !== v)
                          : [...value.vibes, v],
                      })
                    }
                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors cursor-pointer capitalize ${
                      active
                        ? "bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 font-semibold"
                        : "bg-stone-50 dark:bg-stone-800/80 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700"
                    }`}
                  >
                    {v.replaceAll("-", " ")}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bottom Action: Pick For Me */}
          <div className="pt-2 border-t border-stone-100 dark:border-stone-800">
            <button
              type="button"
              aria-label="Pick For Me"
              disabled={!canPick}
              onClick={() => {
                onPick();
                setOpen(false);
              }}
              className="w-full py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-40"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-200" />
              <span>Pick For Me</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function StatusTabs({
  value,
  onChange,
}: {
  value: Filters;
  onChange: (f: Filters) => void;
}) {
  return (
    <div
      className="inline-flex items-center p-0.5 bg-stone-100 dark:bg-stone-800/90 rounded-xl border border-stone-200/80 dark:border-stone-700 text-xs font-semibold"
      aria-label="Venue status tabs"
    >
      {[
        { key: "all", label: "All" },
        { key: "visited", label: "Visited" },
        { key: "wishlist", label: "Wishlist" },
      ].map((tab) => {
        const isSelected = value.status === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            aria-label={`Show ${tab.label} venues`}
            aria-pressed={isSelected}
            onClick={() => onChange({ ...value, status: tab.key })}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              isSelected
                ? "bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs font-bold"
                : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
