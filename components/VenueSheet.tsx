"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  Navigation,
  Star,
  Bookmark,
  MapPin,
  Coffee,
  Utensils,
  Croissant,
  Wine,
  Share2,
  Trash2,
  Plus,
  Edit3,
  Footprints,
  Car,
  X,
  Check,
  Calendar,
  Camera,
  Image as ImageIcon,
  FolderPlus,
} from "lucide-react";
import { db } from "@/app/db";
import {
  vibeTags,
  type Spot,
  type SpotCollection,
  type MenuItemNote,
} from "@/lib/models";
import {
  formatDistance,
  haversine,
  humanReadableLocation,
  type Coordinates,
  type Venue,
} from "@/lib/geo";
import {
  DuplicateVenueError,
  deleteVenue,
  saveCollection,
  type SpotDraft,
  type VisitDraft,
} from "@/lib/journal";
import { compressVisitPhoto, shareCard } from "@/lib/journalMedia";
import JournalPhoto from "./JournalPhoto";
import { useToast } from "@/lib/toast";

export type SaveVenue = (
  venue: Venue,
  draft: SpotDraft,
  visit?: VisitDraft,
  duplicateId?: string,
) => Promise<void>;

interface Props {
  embedded?: boolean;
  venue: Venue;
  position: Coordinates | null;
  online: boolean;
  routeMode?: "foot" | "driving";
  onMode?: (mode: "foot" | "driving") => void;
  showRoute?: boolean;
  onRoute?: () => void;
  routeStatus?: string;
  onClose: () => void;
  onSave: SaveVenue;
  collections: SpotCollection[];
  initialAction?: "visit" | "wishlist";
}

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

export default function VenueSheet(p: Props) {
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState(!!p.initialAction);
  const current = useLiveQuery(
    () => (p.venue.record ? db.venues.get(p.venue.record.id) : undefined),
    [p.venue.record?.id],
  );
  const spot = current ?? p.venue.record;
  const visits =
    useLiveQuery(
      () =>
        spot
          ? db.visitLogs
              .where("spotId")
              .equals(spot.id)
              .filter((v) => !v.isDeleted)
              .reverse()
              .sortBy("visitedAt")
          : [],
      [spot?.id],
    ) ?? [];

  const [action, setAction] = useState<"visit" | "wishlist" | "edit" | null>(
    p.initialAction ?? null,
  );
  const [name, setName] = useState(
    p.venue.name === "Dropped pin" ? "" : p.venue.name,
  );
  const [category, setCategory] = useState(p.venue.category);
  const [budget, setBudget] = useState(spot?.budgetTier ?? "");
  const [vibes, setVibes] = useState(spot?.vibeTags ?? []);
  const [selectedCollections, setSelectedCollections] = useState<string[]>(
    spot?.collectionIds ?? [],
  );
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);

  const [menu, setMenu] = useState<MenuItemNote[]>(spot?.menuItems ?? []);
  const [menuName, setMenuName] = useState("");
  const [verdict, setVerdict] = useState<"must-order" | "skip">("must-order");

  // Ratings default to 0 (unselected) so ratings require intentional input
  const [rating, setRating] = useState(0);
  const [date, setDate] = useState(() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });
  const [notes, setNotes] = useState(spot?.notes ?? "");
  const [items, setItems] = useState("");
  const [spend, setSpend] = useState("");

  const [photos, setPhotos] = useState<VisitDraft["photos"]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [duplicate, setDuplicate] = useState<Spot | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const heading = useRef<HTMLHeadingElement>(null);
  const quickPhotoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  // Sync state if venue or action changes
  useEffect(() => {
    if (p.initialAction) {
      setAction(p.initialAction);
      setExpanded(true);
    }
  }, [p.initialAction]);

  useEffect(() => {
    if (spot) {
      setName(spot.name);
      setCategory(spot.category);
      setBudget(spot.budgetTier ?? "");
      setVibes(spot.vibeTags ?? []);
      setSelectedCollections(spot.collectionIds ?? []);
      setMenu(spot.menuItems ?? []);
      setNotes(spot.notes ?? "");
    }
  }, [spot]);

  async function handleCreateCollectionInline() {
    if (!newCollectionName.trim()) return;
    setCreatingCollection(true);
    try {
      const col = await saveCollection(newCollectionName.trim(), "", spot?.userId);
      setSelectedCollections((prev) => [...prev, col.id]);
      setNewCollectionName("");
      setShowNewCollection(false);
      showToast(`Created collection "${col.name}"`, "success");
    } catch {
      showToast("Could not create collection", "error");
    } finally {
      setCreatingCollection(false);
    }
  }

  // Quick Photo Upload handler when viewing a saved spot
  async function handleQuickPhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || !files.length || !spot) return;

    setProcessing(true);
    try {
      const now = Date.now();
      for (const file of Array.from(files)) {
        const compressed = await compressVisitPhoto(file);
        const photoId = crypto.randomUUID();

        const latestVisit = visits[0];
        let targetVisitId = latestVisit?.id;

        if (!targetVisitId) {
          targetVisitId = crypto.randomUUID();
          await db.visitLogs.add({
            id: targetVisitId,
            spotId: spot.id,
            userId: spot.userId,
            visitedAt: now,
            rating: spot.overallRating ?? 5,
            itemsOrdered: [],
            photoUrls: [],
            localPhotoIds: [photoId],
            createdAt: now,
            updatedAt: now,
            syncStatus: "pending",
          });
        } else {
          await db.visitLogs.update(targetVisitId, {
            localPhotoIds: [...(latestVisit.localPhotoIds ?? []), photoId],
            updatedAt: now,
            syncStatus: "pending",
          });
        }

        await db.photoQueue.add({
          id: photoId,
          spotId: spot.id,
          visitLogId: targetVisitId,
          blob: compressed.blob,
          thumbnail: compressed.thumbnail,
          status: "pending",
          createdAt: now,
          userId: spot.userId,
        });

        if (!spot.localCoverPhotoId) {
          await db.venues.update(spot.id, {
            localCoverPhotoId: photoId,
            updatedAt: now,
            syncStatus: "pending",
          });
        }
      }
      showToast("Photo saved to this spot", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to upload photo", "error");
    } finally {
      setProcessing(false);
      e.target.value = "";
    }
  }

  async function handleSave(duplicateId?: string) {
    if (saving || processing) return;
    if (!name.trim()) {
      setMessage("Please enter a venue name.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const isWish = action === "wishlist";
      const draft: SpotDraft = {
        name: name.trim(),
        category,
        status: isWish ? "wishlist" : (spot?.status ?? "visited"),
        vibeTags: isWish ? [] : vibes,
        menuItems: menu,
        collectionIds: selectedCollections,
        notes: notes.trim() || undefined,
        ...(budget ? { budgetTier: budget as Spot["budgetTier"] } : { budgetTier: undefined }),
      };

      const visit: VisitDraft | undefined =
        action === "visit"
          ? {
              rating: rating > 0 ? rating : 5,
              visitedAt: new Date(date).getTime(),
              notes: notes.trim(),
              itemsOrdered: items
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
              ...(spend !== "" ? { totalSpend: Number(spend) } : {}),
              photos,
            }
          : undefined;

      await p.onSave(p.venue, draft, visit, duplicateId);
      setAction(null);
      setDuplicate(null);
      setPhotos([]);
      setPhotoPreviews([]);
      setNotes("");
      setItems("");
      setSpend("");
      setRating(0);
      showToast(isWish ? "Saved to Want to Try" : "Visit logged successfully", "success");
    } catch (e) {
      if (e instanceof DuplicateVenueError) {
        setDuplicate(e.spot);
      } else {
        setMessage(e instanceof Error ? e.message : "Could not save. Try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  const { lat, lng } = p.venue.location;
  const isWishlist = spot?.status === "wishlist";

  const allPhotoIds = Array.from(
    new Set([
      ...(spot?.localCoverPhotoId ? [spot.localCoverPhotoId] : []),
      ...visits.flatMap((v) => v.localPhotoIds ?? []),
    ]),
  );

  return (
    <section
      role="region"
      aria-label={`Venue details: ${p.venue.name}`}
      data-expanded={expanded}
      data-embedded={!!p.embedded}
      className={`venue-detail flex flex-col bg-white dark:bg-[#1C1612] text-stone-900 dark:text-stone-100 ${
        p.embedded ? "h-full w-full border-0" : "rounded-t-2xl sm:rounded-2xl shadow-xl"
      }`}
    >
      {/* Mobile Drawer Grabber */}
      {!p.embedded && (
        <button
          type="button"
          className="sheet-toggle md:hidden w-full py-2 flex flex-col items-center justify-center cursor-pointer shrink-0"
          aria-label={expanded ? "Collapse venue details" : "Expand venue details"}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="w-12 h-1.5 rounded-full bg-stone-300 dark:bg-stone-700" />
        </button>
      )}

      {/* Header Bar */}
      <div className="p-4 border-b border-stone-200/80 dark:border-stone-800 bg-[#FAF7F2] dark:bg-[#15110F] shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                isWishlist
                  ? "bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                  : "bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200"
              }`}
            >
              <CategoryIcon category={p.venue.category} className="w-5 h-5" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 bg-stone-200/70 dark:bg-stone-800 px-1.5 py-0.5 rounded">
                  {p.venue.category}
                </span>
                {spot?.status && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      isWishlist
                        ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                        : "bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800"
                    }`}
                  >
                    {isWishlist ? "Want to Try" : "Visited"}
                  </span>
                )}
                {spot?.budgetTier && (
                  <span className="text-[10px] font-bold text-stone-700 dark:text-stone-300 bg-stone-200/70 dark:bg-stone-800 px-1.5 py-0.5 rounded">
                    {spot.budgetTier}
                  </span>
                )}
              </div>

              <h2
                ref={heading}
                tabIndex={-1}
                className="text-lg sm:text-xl font-serif font-bold text-stone-900 dark:text-white mt-1 truncate outline-none"
              >
                {spot?.name ?? p.venue.name}
              </h2>

              <p className="text-xs text-stone-600 dark:text-stone-300 truncate mt-0.5 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
                <span>{humanReadableLocation(p.venue.location, spot?.locationMissing)}</span>
                {p.position && !spot?.locationMissing && (
                  <span className="font-semibold text-stone-700 dark:text-stone-300 tabular-nums">
                    {" "}· {formatDistance(haversine(p.position, p.venue.location))} away
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {spot?.overallRating && (
              <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full text-xs font-bold tabular-nums">
                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                <span>{spot.overallRating.toFixed(1)}</span>
              </div>
            )}
            <button
              type="button"
              aria-label="Close venue details"
              onClick={p.onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 md:inline hidden" />
              <X className="w-4 h-4 md:hidden inline" />
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="venue-detail-body flex-1 overflow-y-auto p-4 space-y-4">
        {/* -------------------------------------------------------------- */}
        {/*  UNSAVED SPOT STATE: Clean, simple choice (Log Visit or Want to Try) */}
        {/*  No premature Google Maps, Waze, Menu Memory, or Visit History    */}
        {/* -------------------------------------------------------------- */}
        {!spot && !action && (
          <div className="p-4 bg-stone-50 dark:bg-[#251D18] rounded-2xl border border-stone-200/80 dark:border-stone-800 space-y-3 text-center">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 flex items-center justify-center mx-auto">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-base text-stone-900 dark:text-white">
                Save This Place
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 max-w-xs mx-auto mt-0.5 leading-relaxed">
                Add this spot to your KeepCheck map so you always remember what to order.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAction("visit")}
                className="py-2.5 px-3 bg-amber-700 hover:bg-amber-800 active:bg-amber-900 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Log a Visit</span>
              </button>
              <button
                type="button"
                onClick={() => setAction("wishlist")}
                className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Bookmark className="w-4 h-4" />
                <span>Want to Try</span>
              </button>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------- */}
        {/*  SAVED SPOT POST-SAVE DETAILS (Only shown once venue is saved) */}
        {/* -------------------------------------------------------------- */}
        {spot && !action && (
          <>
            {/* Primary Action Buttons: Log Another Visit or Edit */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAction("visit")}
                className="py-2.5 px-3 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{spot.status === "wishlist" ? "Log Visit (Been Here)" : "Log Another Visit"}</span>
              </button>

              <button
                type="button"
                onClick={() => setAction("edit")}
                className="py-2.5 px-3 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 border border-stone-200 dark:border-stone-700 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Details</span>
              </button>

              <div className="col-span-2 flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    void shareCard(spot.name, [
                      `${spot.overallRating ? `★ ${spot.overallRating.toFixed(1)}/5 · ` : ""}${
                        spot.location.locality ?? spot.location.formattedAddress
                      }`,
                      spot.vibeTags.map((v) => v.replaceAll("-", " ")).join(" · "),
                      ...(spot.notes ? [`Note: ${spot.notes}`] : []),
                      ...spot.menuItems
                        .filter((m) => m.verdict === "must-order")
                        .map((m) => `Must order: ${m.name}`),
                    ]).catch(() => setMessage("Could not create share card"));
                  }}
                  className="flex-1 py-1.5 px-3 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-stone-200/60 dark:border-stone-700"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share Card</span>
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="py-1.5 px-3 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-700 dark:text-red-400 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-red-200 dark:border-red-900"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              </div>
            </div>

            {/* Notes / What to Try (if saved) */}
            {spot.notes && (
              <div className="p-3 bg-[#FAF7F2] dark:bg-[#251D18] rounded-xl border border-stone-200/80 dark:border-stone-800 text-xs">
                <span className="font-bold text-stone-600 dark:text-stone-400 uppercase tracking-wider block text-[10px] mb-1">
                  Notes & Recommendations
                </span>
                <p className="text-stone-800 dark:text-stone-200 italic leading-relaxed">
                  “{spot.notes}”
                </p>
              </div>
            )}

            {/* Photo Gallery & Direct Image Upload */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Photos ({allPhotoIds.length})</span>
                </h4>

                <button
                  type="button"
                  onClick={() => quickPhotoInputRef.current?.click()}
                  disabled={processing}
                  className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Photo</span>
                </button>
              </div>

              {allPhotoIds.length > 0 ? (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {allPhotoIds.map((id) => (
                    <div
                      key={id}
                      className="w-28 h-24 rounded-xl overflow-hidden border border-stone-200 dark:border-stone-700 shrink-0 bg-stone-100 dark:bg-stone-800 shadow-2xs"
                    >
                      <JournalPhoto id={id} alt={spot.name} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 bg-stone-50 dark:bg-[#251D18] rounded-xl border border-dashed border-stone-300 dark:border-stone-700 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-400">
                    <Camera className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span>No photos attached yet</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => quickPhotoInputRef.current?.click()}
                    disabled={processing}
                    className="px-2.5 py-1 bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-xs font-semibold rounded-lg border border-stone-200 dark:border-stone-700 transition-colors cursor-pointer shadow-2xs"
                  >
                    + Upload Photo
                  </button>
                </div>
              )}

              <input
                ref={quickPhotoInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleQuickPhotoUpload}
                className="hidden"
              />
            </div>

            {/* In-App Route & External Navigation Links */}
            {!spot.locationMissing && (
              <div className="p-3 bg-stone-50 dark:bg-[#251D18] rounded-xl border border-stone-200/80 dark:border-stone-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  {p.onRoute && (
                    <div className="flex items-center gap-1.5">
                      <div className="inline-flex rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 p-0.5 text-xs font-medium">
                        <button
                          type="button"
                          onClick={() => p.onMode?.("foot")}
                          className={`px-2 py-1 rounded-md flex items-center gap-1 cursor-pointer ${
                            p.routeMode === "foot"
                              ? "bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 font-bold"
                              : "text-stone-600 dark:text-stone-400"
                          }`}
                        >
                          <Footprints className="w-3.5 h-3.5" />
                          <span>Walk</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => p.onMode?.("driving")}
                          className={`px-2 py-1 rounded-md flex items-center gap-1 cursor-pointer ${
                            p.routeMode === "driving"
                              ? "bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 font-bold"
                              : "text-stone-600 dark:text-stone-400"
                          }`}
                        >
                          <Car className="w-3.5 h-3.5" />
                          <span>Drive</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={p.onRoute}
                        disabled={!p.showRoute && (!p.position || !p.online)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                          p.showRoute
                            ? "bg-amber-700 text-white border-amber-800"
                            : "bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 border-stone-300 dark:border-stone-700 hover:bg-stone-100"
                        }`}
                      >
                        {p.showRoute ? "Hide Route" : "Show Route"}
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <a
                      target="_blank"
                      rel="noopener noreferrer"
                      href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=${
                        p.routeMode === "driving" ? "driving" : "walking"
                      }`}
                      className="px-2.5 py-1.5 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 text-xs font-semibold rounded-lg border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors flex items-center gap-1"
                    >
                      <Navigation className="w-3 h-3 text-amber-700 dark:text-amber-400" />
                      <span>Google Maps ↗</span>
                    </a>
                    <a
                      target="_blank"
                      rel="noopener noreferrer"
                      href={`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`}
                      className="px-2.5 py-1.5 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 text-xs font-semibold rounded-lg border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors flex items-center gap-1"
                    >
                      <span>Waze ↗</span>
                    </a>
                  </div>
                </div>

                {p.routeStatus && (
                  <p role="status" className="text-[11px] font-medium text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/60 p-1.5 rounded border border-amber-200 dark:border-amber-800">
                    {p.routeStatus}
                  </p>
                )}
              </div>
            )}

            {/* Vibe Tags */}
            {spot.vibeTags && spot.vibeTags.length > 0 && (
              <div>
                <h4 className="text-[11px] font-bold text-stone-600 dark:text-stone-300 uppercase tracking-wider mb-1.5">
                  Vibes & Amenities
                </h4>
                <div className="flex flex-wrap gap-1">
                  {spot.vibeTags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 rounded-lg text-xs font-medium capitalize"
                    >
                      {tag.replaceAll("-", " ")}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Menu Memory Section */}
            <div className="p-3.5 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200/60 dark:border-amber-800/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="font-serif font-bold text-xs uppercase tracking-wider text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                  <Utensils className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                  <span>Menu Memory</span>
                </h4>
              </div>

              {spot.menuItems && spot.menuItems.length > 0 ? (
                <div className="space-y-1.5">
                  {spot.menuItems.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between bg-white dark:bg-[#1E1815] px-2.5 py-1.5 rounded-lg border border-amber-200/50 dark:border-stone-700 text-xs"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            m.verdict === "must-order" ? "bg-emerald-500" : "bg-stone-400"
                          }`}
                        />
                        <span className="font-semibold text-stone-900 dark:text-stone-100 truncate">{m.name}</span>
                        {m.price !== undefined && (
                          <span className="text-stone-500 dark:text-stone-400 tabular-nums">· ₱{m.price}</span>
                        )}
                      </div>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          m.verdict === "must-order"
                            ? "bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200"
                            : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300"
                        }`}
                      >
                        {m.verdict === "must-order" ? "Must Order" : "Skip"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-stone-500 dark:text-stone-400 italic">No dishes or drinks recorded yet.</p>
              )}

              {/* Quick Add Menu Item Inline */}
              <div className="pt-2 border-t border-amber-200/40 dark:border-stone-700 flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="Add dish or drink…"
                  value={menuName}
                  onChange={(e) => setMenuName(e.target.value)}
                  className="flex-1 h-8 px-2.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs text-stone-900 dark:text-stone-100 outline-none focus:border-amber-600"
                />
                <select
                  value={verdict}
                  onChange={(e) => setVerdict(e.target.value as "must-order" | "skip")}
                  className="h-8 px-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs text-stone-800 dark:text-stone-200"
                >
                  <option value="must-order">Must order</option>
                  <option value="skip">Skip</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (menuName.trim() && spot) {
                      const newItem: MenuItemNote = {
                        id: crypto.randomUUID(),
                        name: menuName.trim(),
                        verdict,
                      };
                      const updatedMenu = [...(spot.menuItems ?? []), newItem];
                      setMenu(updatedMenu);
                      void p.onSave(p.venue, {
                        name: spot.name,
                        category: spot.category,
                        status: spot.status,
                        vibeTags: spot.vibeTags,
                        menuItems: updatedMenu,
                        collectionIds: spot.collectionIds,
                        notes: spot.notes,
                        budgetTier: spot.budgetTier,
                      });
                      setMenuName("");
                    }
                  }}
                  className="h-8 px-2.5 bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Visit History Timeline */}
            <div className="space-y-3 pt-2">
              <h4 className="font-serif font-bold text-sm text-stone-900 dark:text-white flex items-center justify-between">
                <span>Visit History</span>
                <span className="text-xs font-sans text-stone-500 dark:text-stone-400 tabular-nums">
                  {visits.length} {visits.length === 1 ? "visit" : "visits"}
                </span>
              </h4>

              {visits.length > 0 ? (
                <div className="space-y-3 relative pl-3 border-l-2 border-amber-200 dark:border-amber-800">
                  {visits.map((v) => (
                    <div key={v.id} className="relative text-xs space-y-1">
                      <div className="absolute -left-[19px] top-1 w-3 h-3 rounded-full bg-amber-600 border-2 border-white dark:border-stone-900 ring-2 ring-amber-200 dark:ring-amber-900" />
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-stone-400" />
                          {new Date(v.visitedAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                        <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded font-bold text-[11px] tabular-nums">
                          <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                          <span>{v.rating}</span>
                        </div>
                      </div>

                      {v.totalSpend !== undefined && (
                        <p className="text-stone-600 dark:text-stone-300 font-medium tabular-nums">Spent: ₱{v.totalSpend}</p>
                      )}

                      {v.itemsOrdered && v.itemsOrdered.length > 0 && (
                        <p className="text-stone-700 dark:text-stone-300">
                          <span className="font-semibold">Ordered:</span> {v.itemsOrdered.join(", ")}
                        </p>
                      )}

                      {v.notes && <p className="text-stone-600 dark:text-stone-300 italic">“{v.notes}”</p>}

                      {v.localPhotoIds.length > 0 && (
                        <div className="flex items-center gap-1.5 pt-1 overflow-x-auto">
                          {v.localPhotoIds.map((id, i) => (
                            <div key={id} className="w-16 h-14 rounded-lg overflow-hidden border border-stone-200 dark:border-stone-700 shrink-0 bg-stone-100 dark:bg-stone-800">
                              <JournalPhoto id={id} url={v.photoUrls[i]} alt={`Visit photo ${i + 1}`} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-stone-500 dark:text-stone-400 italic">No past visits recorded yet.</p>
              )}
            </div>
          </>
        )}

        {/* Delete Confirmation Card */}
        {confirmDelete && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl space-y-2">
            <p className="text-xs text-red-800 dark:text-red-300 font-semibold">
              Delete this venue and its visit history? This cannot be undone.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (spot) {
                    void deleteVenue(spot.id)
                      .then(p.onClose)
                      .catch(() => setMessage("Delete failed"));
                  }
                }}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg cursor-pointer"
              >
                Yes, Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------- */}
        {/*  ACTION FORMS: Log a Visit, Want to Try, or Edit Details      */}
        {/* -------------------------------------------------------------- */}
        {action && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSave();
            }}
            className="p-4 bg-stone-50 dark:bg-[#251D18] rounded-2xl border border-stone-200/90 dark:border-stone-700 space-y-3.5"
          >
            <div className="pb-2 border-b border-stone-200 dark:border-stone-700">
              <h3 className="font-serif font-bold text-base text-stone-900 dark:text-white">
                {action === "visit"
                  ? "Log a Visit"
                  : action === "wishlist"
                    ? "Save to Want to Try"
                    : "Edit Venue Details"}
              </h3>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                Venue Name *
              </label>
              <input
                required
                aria-label="Venue name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-xs text-stone-900 dark:text-stone-100 outline-none focus:border-amber-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                  Category
                </label>
                <select
                  aria-label="Venue category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Spot["category"])}
                  className="w-full h-9 px-2 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-xs text-stone-900 dark:text-stone-100"
                >
                  {["coffee", "restaurant", "bakery", "bar", "other"].map((c) => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                  Budget
                </label>
                <select
                  aria-label="Budget tier"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value as typeof budget)}
                  className="w-full h-9 px-2 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-xs text-stone-900 dark:text-stone-100"
                >
                  <option value="">Not set</option>
                  {["₱", "₱₱", "₱₱₱"].map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* -------------------------------------------------------- */}
            {/*  WANT TO TRY SPECIFICS: Notes / What to Try              */}
            {/*  No Vibes & Amenities (per requirement)                  */}
            {/* -------------------------------------------------------- */}
            {action === "wishlist" && (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                  Notes / What to Try
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Recommended by Sarah, want to try the matcha latte & sourdough…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-xs text-stone-900 dark:text-stone-100 outline-none resize-none placeholder:text-stone-400"
                />
              </div>
            )}

            {/* -------------------------------------------------------- */}
            {/*  LOG A VISIT SPECIFICS                                   */}
            {/* -------------------------------------------------------- */}
            {action === "visit" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                      Visited At
                    </label>
                    <input
                      type="datetime-local"
                      required
                      aria-label="Visit date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full h-9 px-2 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-xs text-stone-900 dark:text-stone-100"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                      Rating {rating > 0 ? `(${rating}/5)` : ""}
                    </label>
                    <div className="flex items-center gap-1 h-9">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setRating(s)}
                          className="p-0.5 cursor-pointer hover:scale-110 transition-transform"
                          aria-label={`Rate ${s} stars`}
                        >
                          <Star
                            className={`w-5 h-5 ${
                              rating >= s
                                ? "fill-amber-500 text-amber-500"
                                : "text-stone-300 dark:text-stone-600"
                            }`}
                          />
                        </button>
                      ))}
                      {rating === 0 && (
                        <span className="text-[10px] text-stone-400 ml-1">Tap to rate</span>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                    Items Ordered
                  </label>
                  <input
                    aria-label="Items ordered"
                    placeholder="Separate with commas (e.g. Latte, Croissant)"
                    value={items}
                    onChange={(e) => setItems(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-xs text-stone-900 dark:text-stone-100 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                    Total Spend (₱)
                  </label>
                  <input
                    aria-label="Total spend"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 450"
                    value={spend}
                    onChange={(e) => setSpend(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-xs text-stone-900 dark:text-stone-100 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                    Notes
                  </label>
                  <textarea
                    rows={2}
                    aria-label="Visit notes"
                    placeholder="What did you think of the coffee and vibe?"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-xs text-stone-900 dark:text-stone-100 outline-none resize-none"
                  />
                </div>

                {/* Photos (Clean title without developer jargon) */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1">
                    Photos
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {photoPreviews.map((preview, i) => (
                      <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-stone-200 dark:border-stone-700 group">
                        <img src={preview} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => {
                            setPhotos((prev) => prev.filter((_, idx) => idx !== i));
                            setPhotoPreviews((prev) => prev.filter((_, idx) => idx !== i));
                          }}
                          className="absolute top-1 right-1 w-5 h-5 bg-black/70 text-white rounded-full flex items-center justify-center hover:bg-black"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}

                    <label className="w-16 h-16 rounded-xl border-2 border-dashed border-stone-300 dark:border-stone-600 hover:border-amber-600 flex flex-col items-center justify-center gap-1 text-stone-500 dark:text-stone-400 cursor-pointer bg-white dark:bg-stone-800 transition-colors">
                      <Camera className="w-5 h-5" />
                      <span className="text-[9px] font-semibold">Upload</span>
                      <input
                        aria-label="Visit photos"
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={processing}
                        onChange={async (e) => {
                          const files = Array.from(e.target.files ?? []);
                          setProcessing(true);
                          try {
                            for (const f of files.slice(0, 6)) {
                              const compressed = await compressVisitPhoto(f);
                              setPhotos((prev) => [...prev, compressed]);
                              setPhotoPreviews((prev) => [
                                ...prev,
                                URL.createObjectURL(compressed.thumbnail),
                              ]);
                            }
                          } catch {
                            setMessage("Could not process photo.");
                          } finally {
                            setProcessing(false);
                            e.target.value = "";
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {/* Vibe Tags selector */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1.5">
                    Vibes & Amenities
                  </label>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    {vibeTags.map((v) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={vibes.includes(v)}
                        onClick={() =>
                          setVibes((old) =>
                            old.includes(v) ? old.filter((x) => x !== v) : [...old, v]
                          )
                        }
                        className={`px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors cursor-pointer capitalize ${
                          vibes.includes(v)
                            ? "bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-800 font-semibold"
                            : "bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700"
                        }`}
                      >
                        {v.replaceAll("-", " ")}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* -------------------------------------------------------- */}
            {/*  INLINE COLLECTIONS PICKER & CREATION                    */}
            {/* -------------------------------------------------------- */}
            <div className="pt-1 border-t border-stone-200 dark:border-stone-700">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                  Collections
                </label>
                <button
                  type="button"
                  onClick={() => setShowNewCollection(!showNewCollection)}
                  className="text-[11px] font-bold text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <FolderPlus className="w-3 h-3" />
                  <span>+ New Collection</span>
                </button>
              </div>

              {showNewCollection && (
                <div className="flex items-center gap-1.5 mb-2 p-2 rounded-xl bg-white dark:bg-stone-800 border border-amber-200 dark:border-amber-800">
                  <input
                    type="text"
                    placeholder="e.g. Best Matchas, Date Night…"
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    className="flex-1 h-7 px-2 rounded-md bg-stone-50 dark:bg-stone-900 text-xs border border-stone-200 dark:border-stone-700 outline-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleCreateCollectionInline();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleCreateCollectionInline}
                    disabled={creatingCollection || !newCollectionName.trim()}
                    className="px-2.5 py-1 bg-amber-700 text-white rounded-md text-xs font-bold disabled:opacity-50 cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              )}

              {p.collections.length > 0 ? (
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                  {p.collections.map((col) => {
                    const active = selectedCollections.includes(col.id);
                    return (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() =>
                          setSelectedCollections((prev) =>
                            active ? prev.filter((id) => id !== col.id) : [...prev, col.id]
                          )
                        }
                        className={`px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                          active
                            ? "bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 font-bold"
                            : "bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700"
                        }`}
                      >
                        {col.name}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-stone-400 italic">No collections created yet.</p>
              )}
            </div>

            {/* Duplicate Notice */}
            {duplicate && (
              <div role="alert" className="p-3 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-xl text-xs space-y-2">
                <p className="font-semibold text-amber-900 dark:text-amber-200">
                  You already saved {duplicate.name} — log a new visit to it?
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAction("visit");
                      if (action === "visit") void handleSave(duplicate.id);
                    }}
                    className="px-3 py-1 bg-amber-700 text-white rounded text-xs font-semibold cursor-pointer"
                  >
                    Save visit to existing
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuplicate(null)}
                    className="text-xs text-stone-600 dark:text-stone-400 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Single Form Footer with Single Cancel Button & Correct Action Text */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200 dark:border-stone-700">
              <button
                type="button"
                onClick={() => setAction(null)}
                className="px-3 py-1.5 text-xs text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || processing}
                className={`px-4 py-2 font-bold text-xs rounded-xl shadow-xs cursor-pointer disabled:opacity-50 text-white transition-all ${
                  action === "wishlist"
                    ? "bg-indigo-600 hover:bg-indigo-700"
                    : "bg-amber-700 hover:bg-amber-800"
                }`}
              >
                {saving
                  ? "Saving…"
                  : action === "wishlist"
                    ? "Save to Want to Try"
                    : action === "visit"
                      ? "Save Visit"
                      : "Save Changes"}
              </button>
            </div>
          </form>
        )}

        {message && (
          <p role="status" className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/60 p-2 rounded-lg border border-amber-200 dark:border-amber-800">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
