"use client";

import { useCallback, useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/app/db";
import { makeThumbnailFromBlob } from "@/utils/image";
import { X, ImageOff, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { writeSpotToFirestore } from "@/lib/firestore";

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
 * Full-resolution image viewer modal — neumorphic design.
 */
export default function SpotDetailModal({
  spotId,
  onClose,
}: SpotDetailModalProps) {
  const image = useLiveQuery(
    () => db.images.where("spotId").equals(spotId).first(),
    [spotId],
  );

  const { user } = useAuth();
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

  /* ---- Prevent body scroll when modal is open ---- */
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  /* ---- Regenerate thumbnail from full-res Blob ---- */
  const handleRegenerate = useCallback(async () => {
    if (!image?.blob) return;
    setRegenerating(true);
    try {
      const spot = await db.spots.get(spotId);
      if (!spot) throw new Error("Spot not found locally");

      const newThumb = await makeThumbnailFromBlob(image.blob);
      await db.spots.update(spotId, { thumbnail: newThumb, pendingSync: true });

      if (user && spot.firebaseId) {
        try {
          await writeSpotToFirestore(user.uid, spot.firebaseId, {
            name: spot.name,
            category: spot.category,
            rating: spot.rating,
            comment: spot.comment,
            createdAt: spot.createdAt,
            thumbnail: newThumb,
          });
          await db.spots.update(spotId, { pendingSync: false });
        } catch (fireErr) {
          console.warn("[KeepCheck] Firestore thumbnail sync failed, will retry on sweep:", fireErr);
        }
      }

      setRegenerated(true);
    } catch (err) {
      console.error("[KeepCheck] Thumbnail regeneration failed:", err);
      alert("Could not regenerate thumbnail. Please try again.");
    } finally {
      setRegenerating(false);
    }
  }, [image, spotId, user]);

  /* ---- Render ---- */
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-backdrop"
      onClick={(e) => {
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
        className="absolute right-4 top-4 z-10 neu-button flex h-11 w-11 items-center justify-center rounded-full text-text-primary cursor-pointer"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Content */}
      <div className="animate-modal-enter max-w-2xl w-full">
        {image === undefined ? (
          /* Still loading from IndexedDB */
          <div className="neu-raised flex items-center justify-center p-12 rounded-3xl">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-text-secondary/20 border-t-accent" />
              <p className="text-sm font-mono text-text-secondary">Loading…</p>
            </div>
          </div>
        ) : objectUrl ? (
          <div className="flex flex-col items-center gap-4">
            <div className="neu-raised overflow-hidden p-2 rounded-3xl">
              <img
                src={objectUrl}
                alt="Full-resolution spot photo"
                className="max-h-[80dvh] max-w-full rounded-2xl object-contain"
              />
            </div>

            {/* Regenerate thumbnail */}
            {!regenerated ? (
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={regenerating}
                className="neu-button inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-medium text-text-primary disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`}
                />
                {regenerating ? "Regenerating…" : "Regenerate Thumbnail"}
              </button>
            ) : (
              <p className="text-xs font-mono text-accent animate-page-enter">
                ✓ Thumbnail updated
              </p>
            )}
          </div>
        ) : (
          /* No image stored for this spot */
          <div className="neu-raised flex flex-col items-center gap-4 p-12 rounded-3xl">
            <div className="neu-inset flex h-20 w-20 items-center justify-center rounded-full">
              <ImageOff className="h-8 w-8 text-text-secondary" />
            </div>
            <p className="text-sm font-mono text-text-secondary">No photo attached</p>
          </div>
        )}
      </div>
    </div>
  );
}
