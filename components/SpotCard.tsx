"use client";

import { memo } from "react";
import {
  Coffee,
  Utensils,
  Croissant,
  Wine,
  MapPin,
  Star,
  Bookmark,
  Wifi,
} from "lucide-react";
import type { Spot } from "@/lib/models";
import { formatDistance } from "@/lib/geo";

function CategoryIcon({
  category,
  className = "w-4 h-4",
}: {
  category: Spot["category"];
  className?: string;
}) {
  switch (category) {
    case "coffee":
      return <Coffee className={className} />;
    case "restaurant":
      return <Utensils className={className} />;
    case "bakery":
      return <Croissant className={className} />;
    case "bar":
      return <Wine className={className} />;
    default:
      return <MapPin className={className} />;
  }
}

export default memo(function SpotCard({
  spot,
  distance,
  active,
  onSelect,
}: {
  spot: Spot;
  distance?: number;
  active?: boolean;
  onSelect: (spot: Spot) => void;
}) {
  const isWishlist = spot.status === "wishlist";
  const mustOrderItem = spot.menuItems?.find((m) => m.verdict === "must-order");

  return (
    <button
      type="button"
      onClick={() => onSelect(spot)}
      aria-label={`View ${spot.name}`}
      className={`group w-full text-left bg-white rounded-xl p-3.5 border transition-all duration-150 cursor-pointer shadow-xs hover:shadow-sm ${
        active
          ? "border-amber-600 ring-2 ring-amber-600/20 bg-amber-50/20"
          : "border-stone-200/80 hover:border-amber-400/90"
      }`}
    >
      {/* Top Row: Category icon, Name, and Status/Rating pill */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
              isWishlist
                ? "bg-indigo-50 text-indigo-700 border border-indigo-100"
                : "bg-amber-100 text-amber-900 border border-amber-200/60"
            }`}
          >
            <CategoryIcon category={spot.category} className="w-4 h-4" />
          </div>

          <div className="min-w-0">
            <h3 className="font-serif font-bold text-sm text-stone-900 truncate leading-snug group-hover:text-amber-800 transition-colors">
              {spot.name}
            </h3>
            <p className="text-xs text-stone-500 truncate mt-0.5">
              {spot.location.locality || spot.location.formattedAddress}
              {distance !== undefined && (
                <span className="font-medium text-stone-600">
                  {" "}· {formatDistance(distance)} away
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Status or Rating Pill */}
        <div className="shrink-0">
          {isWishlist ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              <Bookmark className="w-3 h-3 fill-indigo-600 text-indigo-600" />
              Wishlist
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-900 border border-amber-200">
              <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
              {spot.overallRating ? spot.overallRating.toFixed(1) : "Unrated"}
            </span>
          )}
        </div>
      </div>

      {/* Bottom Pills Row: Vibe Tags & Must-Order highlights */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pt-1 border-t border-stone-100">
        {/* Category label */}
        <span className="text-[10px] uppercase font-bold tracking-wider text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded">
          {spot.category}
        </span>

        {/* Budget tier if set */}
        {spot.budgetTier && (
          <span className="text-[11px] font-medium text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded">
            {spot.budgetTier}
          </span>
        )}

        {/* Must order highlight if present */}
        {mustOrderItem ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-amber-100/70 text-amber-900 border border-amber-200/60 px-2 py-0.5 rounded-md truncate max-w-[200px]">
            Must order: {mustOrderItem.name}
          </span>
        ) : spot.vibeTags && spot.vibeTags.length > 0 ? (
          spot.vibeTags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 text-[11px] font-medium bg-stone-100 text-stone-600 px-2 py-0.5 rounded-md capitalize"
            >
              {tag === "fast-wifi" && <Wifi className="w-3 h-3 text-stone-500" />}
              {tag.replaceAll("-", " ")}
            </span>
          ))
        ) : null}
      </div>
    </button>
  );
});
