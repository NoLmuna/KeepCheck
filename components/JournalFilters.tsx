"use client";

import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal, Sparkles, RotateCcw, Coffee, Utensils, Croissant, Wine, MapPin } from "lucide-react";
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

  const advancedCount =
    Number(value.budget !== "all") +
    Number(value.distance > 0) +
    Number(value.collection !== "all") +
    value.vibes.length +
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
        aria-label="More filters"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`h-8 sm:h-9 px-2.5 sm:px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
          advancedCount > 0 || open
            ? "bg-amber-100/70 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 shadow-2xs font-bold"
            : "bg-white dark:bg-[#1E1815] text-stone-700 dark:text-stone-300 border-stone-200/90 dark:border-stone-700 hover:border-amber-400 dark:hover:border-amber-600 hover:bg-stone-50 dark:hover:bg-[#28201B]"
        }`}
      >
        <SlidersHorizontal className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
        <span>Filters</span>
        {advancedCount > 0 && (
          <span className="w-4 h-4 rounded-full bg-amber-700 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
            {advancedCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-50 w-[320px] max-w-[calc(100vw-32px)] bg-white dark:bg-[#1C1612] border border-stone-200 dark:border-stone-800 rounded-2xl shadow-xl p-4 space-y-3.5 text-stone-900 dark:text-stone-100 animate-modal-enter"
          role="region"
          aria-label="Filters & Decide"
        >
          <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
            <h4 className="font-serif font-bold text-sm text-stone-900 dark:text-white">
              Filter Spots
            </h4>
            {advancedCount > 0 && (
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...defaultFilters,
                    status: value.status,
                    category: value.category,
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
                Budget
              </label>
              <select
                aria-label="Filter budget"
                value={value.budget}
                onChange={(e) => update({ budget: e.target.value })}
                className="w-full h-8 px-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs text-stone-800 dark:text-stone-200 outline-none focus:border-amber-600"
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
                className="w-full h-8 px-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs text-stone-800 dark:text-stone-200 outline-none focus:border-amber-600"
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

            <div className="col-span-2">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400 mb-1">
                Sort Order
              </label>
              <select
                aria-label="Sort saved spots"
                value={value.sort}
                onChange={(e) => update({ sort: e.target.value })}
                className="w-full h-8 px-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs text-stone-800 dark:text-stone-200 outline-none focus:border-amber-600"
              >
                <option value="recent">Recently Visited / Logged</option>
                <option value="rating">Highest Rated</option>
                <option value="nearest" disabled={!hasGps}>
                  Nearest to Me {hasGps ? "" : "(GPS offline)"}
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
                className="w-full h-8 px-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs text-stone-800 dark:text-stone-200 outline-none focus:border-amber-600"
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
              Vibes & Amenities
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
                        ? "bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 font-bold"
                        : "bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700"
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
              className="w-full py-2 bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-800 hover:to-amber-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-40"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-200" />
              <span>Decide For Me (Random Pick)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Status Tabs: All | Visited | Want to Try */
export function StatusTabs({
  value,
  onChange,
}: {
  value: Filters;
  onChange: (f: Filters) => void;
}) {
  return (
    <div
      className="inline-flex items-center p-0.5 bg-stone-100 dark:bg-stone-800 rounded-xl border border-stone-200/80 dark:border-stone-700 text-xs font-semibold"
      aria-label="Venue status tabs"
    >
      {[
        { key: "all", label: "All" },
        { key: "visited", label: "Visited" },
        { key: "wishlist", label: "Want to Try" },
      ].map((tab) => {
        const isSelected = value.status === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            aria-label={`Show ${tab.label} venues`}
            aria-pressed={isSelected}
            onClick={() => onChange({ ...value, status: tab.key })}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              isSelected
                ? "bg-white dark:bg-[#1E1815] text-stone-900 dark:text-white shadow-xs font-bold"
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

/** Scannable Category Filter Pills */
export function CategoryPills({
  value,
  onChange,
}: {
  value: Filters;
  onChange: (f: Filters) => void;
}) {
  const categories = [
    { key: "coffee", label: "Coffee", icon: Coffee },
    { key: "restaurant", label: "Dining", icon: Utensils },
    { key: "bakery", label: "Bakery", icon: Croissant },
    { key: "bar", label: "Bar", icon: Wine },
  ];

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-xs">
      {categories.map((c) => {
        const active = value.category === c.key;
        const Icon = c.icon;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() =>
              onChange({
                ...value,
                category: active ? "all" : c.key,
              })
            }
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer shrink-0 ${
              active
                ? "bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 font-bold shadow-2xs"
                : "bg-white dark:bg-[#1E1815] text-stone-700 dark:text-stone-300 border-stone-200/90 dark:border-stone-700/80 hover:bg-stone-50 dark:hover:bg-[#28201B]"
            }`}
          >
            <Icon className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
            <span>{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}
