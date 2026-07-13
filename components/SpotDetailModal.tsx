"use client";

import { useCallback, useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/app/db";
import { makeThumbnailFromBlob } from "@/utils/image";
import { X, ImageOff, RefreshCw } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */
interface SpotDetailModalProps {
  spotId: number;
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * Full-resolution image viewer modal.
 *
 * Queries the `images` store for the Blob associated with `spotId`,
 * converts it to a displayable object URL, and revokes the URL on
 * unmount / image change to prevent memory leaks.
 *
 * Includes an opportunistic "Regenerate thumbnail" button so users can
 * fix old 150px thumbnails created before the resolution bump to 400px.
 */
export default function SpotDetailModal({
  spotId,
  onClose,
}: SpotDetailModalProps) {
  const image = useLiveQuery(
    () => db.images.where("spotId").equals(spotId).first(),
    [spotId],
  );

  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerated, setRegenerated] = useState(false);

  /* ---- Convert Blob → object URL (and revoke on cleanup) ---- */
  useEffect(() => {
    if (!image?.blob) {
      setObjectUrl(null);
      return;
    }

    const url = URL.createObjectURL(image.blob);
    setObjectUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [image]);

  /* ---- Close on Escape key ---- */
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  /* ---- Regenerate thumbnail from full-res Blob ---- */
  const handleRegenerate = useCallback(async () => {
    if (!image?.blob) return;
    setRegenerating(true);
    try {
      const newThumb = await makeThumbnailFromBlob(image.blob);
      await db.spots.update(spotId, { thumbnail: newThumb });
      setRegenerated(true);
    } catch (err) {
      console.error("[KeepCheck] Thumbnail regeneration failed:", err);
      alert("Could not regenerate thumbnail. Please try again.");
    } finally {
      setRegenerating(false);
    }
  }, [image, spotId]);

  /* ---- Render ---- */
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={(e) => {
        // Close when clicking the backdrop (not the image itself).
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Full-resolution photo"
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-zinc-900/70 text-white backdrop-blur-sm transition-colors hover:bg-zinc-700 active:bg-zinc-600 cursor-pointer"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Image or placeholder */}
      {image === undefined ? (
        /* Still loading from IndexedDB */
        <div className="text-sm text-zinc-400">Loading…</div>
      ) : objectUrl ? (
        <div className="flex flex-col items-center gap-3">
          <img
            src={objectUrl}
            alt="Full-resolution spot photo"
            className="max-h-[85dvh] max-w-full rounded-lg object-contain shadow-2xl"
          />

          {/* Regenerate thumbnail — fixes old 150px thumbnails */}
          {!regenerated ? (
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regenerating}
              className="inline-flex items-center gap-2 rounded-full bg-zinc-900/70 px-4 py-2 text-xs font-medium text-zinc-300 backdrop-blur-sm transition-colors hover:bg-zinc-700 active:bg-zinc-600 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`}
              />
              {regenerating ? "Regenerating…" : "Regenerate Thumbnail"}
            </button>
          ) : (
            <p className="text-xs text-emerald-400">✓ Thumbnail updated</p>
          )}
        </div>
      ) : (
        /* No image stored for this spot */
        <div className="flex flex-col items-center gap-3 text-zinc-500">
          <ImageOff className="h-12 w-12" />
          <p className="text-sm">No photo attached</p>
        </div>
      )}
    </div>
  );
}
