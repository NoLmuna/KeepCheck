"use client";
import { useEffect, useRef, useState } from "react";
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
      className="journal-controls filter-root"
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
        aria-label="Filters & Decide"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Filters{count ? ` (${count})` : ""}
      </button>
      {open && (
        <div
          className="filter-popover"
          role="region"
          aria-label="Filters & Decide"
        >
          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="Filter category"
              value={value.category}
              onChange={(e) => update({ category: e.target.value })}
            >
              <option value="all">All categories</option>
              {["coffee", "restaurant", "bakery", "bar", "other"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <select
              aria-label="Filter budget"
              value={value.budget}
              onChange={(e) => update({ budget: e.target.value })}
            >
              <option value="all">Any budget</option>
              {["₱", "₱₱", "₱₱₱"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <select
              aria-label="Maximum distance"
              value={value.distance}
              onChange={(e) => update({ distance: Number(e.target.value) })}
            >
              <option value={0}>Any distance</option>
              <option disabled={!hasGps} value={1000}>
                Within 1 km
              </option>
              <option disabled={!hasGps} value={3000}>
                Within 3 km
              </option>
            </select>
            <select
              aria-label="Filter collection"
              value={value.collection}
              onChange={(e) => update({ collection: e.target.value })}
            >
              <option value="all">All collections</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Sort saved spots"
              value={value.sort}
              onChange={(e) => update({ sort: e.target.value })}
            >
              <option value="recent">Recently Visited</option>
              <option value="rating">Highest Rated</option>
              <option value="nearest" disabled={!hasGps}>
                Nearest to Me
              </option>
            </select>
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {vibeTags.map((v) => (
              <button
                className="shrink-0"
                key={v}
                aria-label={`Filter ${v.replaceAll("-", " ")}`}
                aria-pressed={value.vibes.includes(v)}
                onClick={() =>
                  update({
                    vibes: value.vibes.includes(v)
                      ? value.vibes.filter((x) => x !== v)
                      : [...value.vibes, v],
                  })
                }
              >
                {v.replaceAll("-", " ")}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              aria-label="Reset filters"
              onClick={() =>
                onChange({
                  ...defaultFilters,
                  status: value.status,
                  query: value.query,
                })
              }
            >
              Reset filters
            </button>
            <button
              aria-label="Pick For Me"
              disabled={!canPick}
              onClick={() => {
                onPick();
                setOpen(false);
              }}
            >
              ✦ Pick For Me
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
    <div className="journal-controls flex gap-1" aria-label="Venue status">
      {["all", "visited", "wishlist"].map((status) => (
        <button
          key={status}
          className="flex-1"
          aria-label={`Show ${status} venues`}
          aria-pressed={value.status === status}
          onClick={() => onChange({ ...value, status })}
        >
          {status === "all"
            ? "All"
            : status === "visited"
              ? "Visited"
              : "Wishlist"}
        </button>
      ))}
    </div>
  );
}
