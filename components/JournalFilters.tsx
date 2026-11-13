"use client";
import { vibeTags, type SpotCollection } from "@/lib/models";
import type { Filters } from "@/lib/journal";
export default function JournalFilters({
  value,
  onChange,
  collections,
  hasGps,
}: {
  value: Filters;
  onChange: (f: Filters) => void;
  collections: SpotCollection[];
  hasGps: boolean;
}) {
  const update = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  return (
    <div className="journal-controls shrink-0 border-b border-text-secondary/15 bg-bg px-3 py-2">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <select
          aria-label="Filter status"
          value={value.status}
          onChange={(e) => update({ status: e.target.value })}
        >
          <option value="all">All statuses</option>
          <option value="visited">Visited</option>
          <option value="wishlist">Wishlist</option>
        </select>
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
      <div className="flex gap-1 overflow-x-auto">
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
    </div>
  );
}
