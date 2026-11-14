"use client";
import { memo } from "react";
import type { Spot } from "@/lib/models";
import { formatDistance } from "@/lib/geo";
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
  return (
    <button
      className={`spot-card ${active ? "spot-card-active" : ""}`}
      aria-label={`View ${spot.name}`}
      onClick={() => onSelect(spot)}
    >
      <strong className="block text-base">{spot.name}</strong>
      <span className="block text-xs">
        {spot.category} ·{" "}
        {spot.status === "wishlist"
          ? "🔖 Wishlist"
          : `★ ${spot.overallRating?.toFixed(1) ?? "—"}/5`}
      </span>
      <span className="block text-sm">
        {spot.location.locality}
        {spot.location.locality && distance !== undefined ? " · " : ""}
        {distance !== undefined ? `${formatDistance(distance)} away` : ""}
      </span>
      {!!spot.vibeTags.length && (
        <span className="block text-xs">
          {spot.vibeTags
            .slice(0, 2)
            .map((v) => v.replaceAll("-", " "))
            .join(" · ")}
        </span>
      )}
    </button>
  );
});
