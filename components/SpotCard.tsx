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
import { formatDistance, humanReadableLocation } from "@/lib/geo";
import JournalPhoto from "./JournalPhoto";

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
  const hasPhoto = Boolean(spot.localCoverPhotoId || spot.coverPhotoUrl);

  return (
    <button
      type="button"
      onClick={() => onSelect(spot)}
      aria-label={`View ${spot.name}`}
      className={`group w-full text-left bg-white dark:bg-[#1E1815] rounded-xl p-3 sm:p-3.5 border transition-all duration-150 cursor-pointer shadow-xs hover:shadow-sm ${
        active
          ? "border-amber-600 dark:border-amber-500 ring-2 ring-amber-600/20 bg-amber-50/40 dark:bg-[#28201B]"
          : "border-stone-200/90 dark:border-stone-800 hover:border-amber-400 dark:hover:border-amber-600/80"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          {/* Cover photo thumbnail or category icon badge */}
          {hasPhoto ? (
            <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-800">
              <JournalPhoto
                id={spot.localCoverPhotoId}
                url={spot.coverPhotoUrl}
                alt={spot.name}
              />
            </div>
          ) : (
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                isWishlist
                  ? "bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                  : "bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 border border-amber-200/70 dark:border-amber-800/60"
              }`}
            >
              <CategoryIcon category={spot.category} className="w-4 h-4" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h3 className="font-serif font-bold text-sm text-stone-900 dark:text-[#F8F4EE] truncate leading-snug group-hover:text-amber-800 dark:group-hover:text-amber-400 transition-colors">
              {spot.name}
            </h3>
            <p className="text-xs text-stone-600 dark:text-stone-300 truncate mt-0.5">
              {spot.locationMissing ? (
                <span className="text-amber-700 dark:text-amber-400 font-medium">
                  Set location on map →
                </span>
              ) : (
                <>
                  <span>{humanReadableLocation(spot.location, spot.locationMissing)}</span>
                  {distance !== undefined && (
                    <span className="font-semibold text-stone-700 dark:text-stone-200 tabular-nums">
                      {" "}· {formatDistance(distance)}
                    </span>
                  )}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Status or Rating Pill */}
        <div className="shrink-0">
          {isWishlist ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/80">
              <Bookmark className="w-3 h-3 fill-indigo-600 dark:fill-indigo-400 text-indigo-600 dark:text-indigo-400" />
              Want to Try
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800 tabular-nums">
              <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
              {spot.overallRating ? spot.overallRating.toFixed(1) : "Unrated"}
            </span>
          )}
        </div>
      </div>

      {/* Bottom Row: Category, Budget, Must-Order, Vibes */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-stone-100 dark:border-stone-800/80">
        <span className="text-[10px] uppercase font-bold tracking-wider text-stone-700 dark:text-stone-300 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded">
          {spot.category}
        </span>

        {spot.budgetTier && (
          <span className="text-[11px] font-medium text-stone-700 dark:text-stone-300 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded">
            {spot.budgetTier}
          </span>
        )}

        {mustOrderItem ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-amber-100/80 dark:bg-amber-950/70 text-amber-950 dark:text-amber-200 border border-amber-200/70 dark:border-amber-800/70 px-2 py-0.5 rounded-md truncate max-w-[210px]">
            Must order: {mustOrderItem.name}
          </span>
        ) : spot.notes ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-stone-600 dark:text-stone-300 italic truncate max-w-[210px]">
            “{spot.notes}”
          </span>
        ) : spot.vibeTags && spot.vibeTags.length > 0 ? (
          spot.vibeTags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 text-[11px] font-medium bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 px-2 py-0.5 rounded-md capitalize"
            >
              {tag === "fast-wifi" && <Wifi className="w-3 h-3 text-stone-500 dark:text-stone-400" />}
              {tag.replaceAll("-", " ")}
            </span>
          ))
        ) : null}
      </div>
    </button>
  );
});
