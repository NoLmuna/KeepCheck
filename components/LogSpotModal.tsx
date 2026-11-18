"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  Star,
  MapPin,
  Coffee,
  Utensils,
  Croissant,
  Wine,
  Camera,
  Check,
  Bookmark,
  FolderPlus,
} from "lucide-react";
import type { Spot, SpotCollection, SpotCategory, MenuItemNote } from "@/lib/models";
import { vibeTags } from "@/lib/models";
import { searchVenues } from "@/lib/osm";
import { humanReadableLocation, type Coordinates, type Venue } from "@/lib/geo";
import {
  saveJournalEntry,
  saveCollection,
  DuplicateVenueError,
  type SpotDraft,
  type VisitDraft,
} from "@/lib/journal";
import { compressVisitPhoto } from "@/lib/journalMedia";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

interface Props {
  initialVenue?: Venue | null;
  position?: Coordinates | null;
  collections: SpotCollection[];
  onClose: () => void;
  onSaved: (spot: Spot) => void;
}

export default function LogSpotModal({
  initialVenue,
  position,
  collections,
  onClose,
  onSaved,
}: Props) {
  const { user, cachedSession } = useAuth();
  const uid = user?.uid ?? cachedSession?.uid;
  const { showToast } = useToast();

  const [mode, setMode] = useState<"visit" | "wishlist">(
    initialVenue?.record?.status === "wishlist" ? "wishlist" : "visit"
  );
  const [showDetails, setShowDetails] = useState(false);
  const [name, setName] = useState(
    initialVenue?.name === "Dropped pin" ? "" : (initialVenue?.name ?? "")
  );
  const [category, setCategory] = useState<SpotCategory>(
    initialVenue?.category ?? "coffee"
  );
  const [address, setAddress] = useState(
    initialVenue?.location.formattedAddress ??
      (position
        ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`
        : "")
  );
  const [locality, setLocality] = useState(initialVenue?.location.locality ?? "");
  const [osmId, setOsmId] = useState<string | undefined>(
    initialVenue?.location.osmId
  );
  const [coords, setCoords] = useState<Coordinates>(
    initialVenue?.location ?? position ?? { lat: 0, lng: 0 }
  );

  // Search autocomplete for venue name
  const [searchResults, setSearchResults] = useState<Venue[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Ratings default to 0 (unselected) so ratings require intentional input
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [date, setDate] = useState(() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });
  const [notes, setNotes] = useState("");
  const [mustOrder, setMustOrder] = useState("");
  const [budget, setBudget] = useState<Spot["budgetTier"]>(undefined);
  const [selectedVibes, setSelectedVibes] = useState<Spot["vibeTags"]>([]);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [spend, setSpend] = useState("");

  // Inline collection creation
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);

  // Photos
  const [photos, setPhotos] = useState<VisitDraft["photos"]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [processingPhoto, setProcessingPhoto] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<Spot | null>(null);
  const backdropPointerDownRef = useRef<EventTarget | null>(null);

  // Keep ref of photo previews so they are always revoked on unmount
  const photoPreviewsRef = useRef<string[]>([]);
  useEffect(() => {
    photoPreviewsRef.current = photoPreviews;
  }, [photoPreviews]);

  useEffect(() => {
    return () => {
      photoPreviewsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      });
    };
  }, []);

  // Lock background scroll when modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Escape key handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Autocomplete search as user types
  useEffect(() => {
    if (initialVenue || name.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchVenues(name.trim(), position ?? null, controller.signal);
        if (!controller.signal.aborted && found) {
          setSearchResults(found);
          setShowDropdown(found.length > 0);
        }
      } catch {
        // Ignored
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [name, initialVenue, position]);

  function handleSelectResult(v: Venue) {
    setName(v.name);
    setCategory(v.category);
    setAddress(v.location.formattedAddress);
    setLocality(v.location.locality ?? "");
    setOsmId(v.location.osmId);
    setCoords(v.location);
    setShowDropdown(false);
  }

  async function handleCreateCollectionInline() {
    if (!newCollectionName.trim()) return;
    setCreatingCollection(true);
    try {
      const col = await saveCollection(newCollectionName.trim(), "", uid);
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

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || !files.length) return;
    setProcessingPhoto(true);
    setError(null);

    try {
      for (const file of Array.from(files)) {
        const compressed = await compressVisitPhoto(file);
        setPhotos((prev) => [...prev, compressed]);
        const previewUrl = URL.createObjectURL(compressed.thumbnail);
        setPhotoPreviews((prev) => [...prev, previewUrl]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to process photo.";
      setError(msg);
      showToast("Could not process photo format. Please select a JPEG, PNG or WebP image.", "error");
    } finally {
      setProcessingPhoto(false);
      e.target.value = "";
    }
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSave(forceDuplicateId?: string) {
    if (!name.trim()) {
      setError("Please enter a venue name.");
      return;
    }

    setSaving(true);
    setError(null);
    setDuplicateWarning(null);

    try {
      // Auto-Geocode Saved Spots:
      // If coordinates are missing (0, 0) or osmId is not attached:
      // Automatically search Photon for name with proximity bias to attach coordinates!
      let resolvedCoords = coords;
      let resolvedAddress = address;
      let resolvedLocality = locality;
      let resolvedOsmId = osmId;

      if ((resolvedCoords.lat === 0 && resolvedCoords.lng === 0) || !resolvedOsmId) {
        const isOnline = typeof navigator !== "undefined" && navigator.onLine;
        if (isOnline) {
          const autoController = new AbortController();
          const autoTimeout = setTimeout(() => autoController.abort(), 2500);
          try {
            const autoFound = await searchVenues(
              name.trim(),
              position ?? null,
              autoController.signal,
            );
            if (autoFound && autoFound.length > 0) {
              const best = autoFound[0];
              resolvedCoords = best.location;
              resolvedAddress = best.location.formattedAddress || resolvedAddress;
              resolvedLocality = best.location.locality ?? resolvedLocality;
              resolvedOsmId = best.location.osmId;
            } else if (position && resolvedCoords.lat === 0 && resolvedCoords.lng === 0) {
              resolvedCoords = position;
              if (!resolvedAddress) {
                resolvedAddress = `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
              }
            }
          } catch {
            if (position && resolvedCoords.lat === 0 && resolvedCoords.lng === 0) {
              resolvedCoords = position;
            }
          } finally {
            clearTimeout(autoTimeout);
          }
        } else if (position && resolvedCoords.lat === 0 && resolvedCoords.lng === 0) {
          resolvedCoords = position;
        }
      }

      const isMissing = resolvedCoords.lat === 0 && resolvedCoords.lng === 0;
      const targetVenue: Venue = initialVenue ?? {
        key: `venue-${resolvedCoords.lat}-${resolvedCoords.lng}-${name}`,
        name: name.trim(),
        category,
        location: {
          lat: resolvedCoords.lat,
          lng: resolvedCoords.lng,
          formattedAddress: isMissing
            ? "Location not recorded"
            : (resolvedAddress || "Near your location"),
          locality: resolvedLocality || undefined,
          osmId: resolvedOsmId,
        },
      };

      const menuItems: MenuItemNote[] = [];
      if (mustOrder.trim()) {
        menuItems.push({
          id: crypto.randomUUID(),
          name: mustOrder.trim(),
          verdict: "must-order",
        });
      }

      const isWishlist = mode === "wishlist";

      const draft: SpotDraft = {
        name: name.trim(),
        category,
        status: isWishlist ? "wishlist" : "visited",
        vibeTags: isWishlist ? [] : selectedVibes,
        menuItems,
        budgetTier: budget,
        collectionIds: selectedCollections,
        notes: notes.trim() || undefined,
      };

      let visit: VisitDraft | undefined = undefined;
      if (!isWishlist || photos.length > 0) {
        visit = {
          rating: rating > 0 ? rating : 5,
          visitedAt: new Date(date).getTime(),
          notes: notes.trim(),
          itemsOrdered: mustOrder.trim() ? [mustOrder.trim()] : [],
          totalSpend: spend ? parseFloat(spend) : undefined,
          photos,
        };
      }

      const savedSpot = await saveJournalEntry(
        targetVenue,
        draft,
        visit,
        uid,
        forceDuplicateId
      );

      showToast(
        isWishlist
          ? `Added "${savedSpot.name}" to Want to Try`
          : `Saved visit to "${savedSpot.name}"`,
        "success"
      );
      onSaved(savedSpot);
      onClose();
    } catch (err: unknown) {
      if (err instanceof DuplicateVenueError) {
        setDuplicateWarning(err.spot);
      } else {
        setError(err instanceof Error ? err.message : "Failed to save spot.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-backdrop"
      onPointerDown={(e) => {
        backdropPointerDownRef.current = e.target;
      }}
      onClick={(e) => {
        if (
          e.target === e.currentTarget &&
          backdropPointerDownRef.current === e.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Save spot modal"
        className="relative w-full max-w-lg max-h-[90dvh] bg-white dark:bg-[#1C1612] rounded-t-3xl sm:rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 flex flex-col overflow-hidden animate-modal-enter"
      >
        {/* Header */}
        <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-stone-200/80 dark:border-stone-800 flex items-center justify-between shrink-0 bg-[#FAF7F2] dark:bg-[#15110F]">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                mode === "wishlist" ? "bg-indigo-600" : "bg-amber-600"
              }`}
            />
            <h2 className="font-serif font-bold text-base sm:text-lg text-stone-900 dark:text-white truncate">
              {mode === "visit" ? "Save Place · Been Here" : "Save Place · Want to Try"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/50 dark:hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4 text-stone-900 dark:text-stone-100">
          {/* Segmented Status Selector: Been Here vs Want to Try */}
          <div className="grid grid-cols-2 p-1 bg-stone-100 dark:bg-stone-800 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMode("visit")}
              className={`min-h-[44px] py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                mode === "visit"
                  ? "bg-white dark:bg-[#1C1612] text-stone-900 dark:text-white shadow-xs font-bold"
                  : "text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200"
              }`}
            >
              <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
              <span>Been Here</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("wishlist")}
              className={`min-h-[44px] py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                mode === "wishlist"
                  ? "bg-white dark:bg-[#1C1612] text-indigo-700 dark:text-indigo-400 shadow-xs font-bold"
                  : "text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200"
              }`}
            >
              <Bookmark className="w-3.5 h-3.5 fill-indigo-600 dark:fill-indigo-400 text-indigo-600 dark:text-indigo-400" />
              <span>Want to Try</span>
            </button>
          </div>

          {/* Place Name & Autocomplete Search */}
          <div className="relative">
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-1">
              Where is it? *
            </label>
            <div className="relative">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Type café or restaurant name…"
                className="w-full h-11 px-3.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20 text-base md:text-sm outline-none transition-all placeholder:text-stone-400"
                autoFocus={!initialVenue}
              />
              {searching && (
                <div className="absolute right-3.5 top-3.5 w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
              )}
            </div>

            {/* Dropdown Results */}
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-30 max-h-48 overflow-y-auto bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl shadow-lg divide-y divide-stone-100 dark:divide-stone-700">
                {searchResults.slice(0, 5).map((res) => (
                  <button
                    key={res.key}
                    type="button"
                    onClick={() => handleSelectResult(res)}
                    className="w-full p-2.5 text-left hover:bg-stone-50 dark:hover:bg-stone-700/60 flex items-start gap-2.5 transition-colors cursor-pointer"
                  >
                    <MapPin className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-stone-900 dark:text-white truncate">{res.name}</p>
                      <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                        {humanReadableLocation(res.location)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Location Summary */}
          {(address || coords.lat !== 0) && (
            <div className="p-2.5 bg-stone-50 dark:bg-stone-800/60 rounded-xl border border-stone-200/70 dark:border-stone-700 text-xs flex items-center gap-2 text-stone-600 dark:text-stone-300">
              <MapPin className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
              <span className="truncate">
                {humanReadableLocation({
                  lat: coords.lat,
                  lng: coords.lng,
                  formattedAddress: address || "Near your location",
                  locality,
                })}
              </span>
            </div>
          )}

          {/* Rating (Only when Been Here) */}
          {mode === "visit" && (
            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-1.5">
                Your Rating
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex items-center">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center p-1 hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                      aria-label={`Rate ${star} stars`}
                    >
                      <Star
                        className={`w-7 h-7 transition-colors ${
                          (hoverRating || rating) >= star
                            ? "fill-amber-500 text-amber-500"
                            : "text-stone-300 dark:text-stone-700"
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <span className="text-xs font-semibold text-stone-600 dark:text-stone-300 ml-1">
                  {rating === 0
                    ? "Tap to rate"
                    : rating === 5
                      ? "Loved it! (5/5)"
                      : rating === 4
                        ? "Great spot (4/5)"
                        : rating === 3
                          ? "Good (3/5)"
                          : rating === 2
                            ? "Fair (2/5)"
                            : "Not for me (1/5)"}
                </span>
              </div>
            </div>
          )}

          {/* Quick Note / Must Order / What to Try */}
          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-1">
              {mode === "visit" ? "What did you order or love here?" : "Notes / What to Try"}
            </label>
            <input
              type="text"
              value={mode === "visit" ? mustOrder : notes}
              onChange={(e) => {
                if (mode === "visit") setMustOrder(e.target.value);
                else setNotes(e.target.value);
              }}
              placeholder={
                mode === "visit"
                  ? "e.g. Spanish Latte, Truffle Pasta, Sourdough…"
                  : "e.g. Recommended by Sarah, try their iced matcha latte…"
              }
              className="w-full h-11 px-3.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20 text-base md:text-sm outline-none placeholder:text-stone-400"
            />
          </div>

          {/* Inline Collections Section */}
          <div className="pt-2 border-t border-stone-200/70 dark:border-stone-800">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                Add to Collections
              </label>
              <button
                type="button"
                onClick={() => setShowNewCollection(!showNewCollection)}
                className="text-[11px] font-bold text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer min-h-[36px]"
              >
                <FolderPlus className="w-3 h-3" />
                <span>+ New Collection</span>
              </button>
            </div>

            {showNewCollection && (
              <div className="flex items-center gap-1.5 mb-2.5 p-2 rounded-xl bg-stone-50 dark:bg-stone-800 border border-amber-200 dark:border-amber-800">
                <input
                  type="text"
                  placeholder="e.g. Best Matchas, Date Night Spots…"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  className="flex-1 h-10 px-2.5 rounded-lg bg-white dark:bg-stone-900 text-base md:text-xs border border-stone-200 dark:border-stone-700 outline-none"
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
                  className="min-h-[44px] px-3.5 py-1.5 bg-amber-700 text-white rounded-lg text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  Add
                </button>
              </div>
            )}

            {collections.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {collections.map((col) => {
                  const isSelected = selectedCollections.includes(col.id);
                  return (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() =>
                        setSelectedCollections((prev) =>
                          isSelected ? prev.filter((id) => id !== col.id) : [...prev, col.id]
                        )
                      }
                      className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 font-bold"
                          : "bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700"
                      }`}
                    >
                      {col.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-stone-400 italic">No collections yet. Create one with the link above!</p>
            )}
          </div>

          {/* Optional Extra Details Toggle */}
          <div className="pt-2 border-t border-stone-200/70 dark:border-stone-800">
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="w-full py-2.5 px-3.5 rounded-xl bg-stone-100 hover:bg-stone-200/80 dark:bg-stone-800 dark:hover:bg-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-300 flex items-center justify-between transition-colors cursor-pointer"
            >
              <span className="font-bold">
                {showDetails ? "− Hide extra details" : "+ Category, price & photos"}
              </span>
              <span className="text-[10px] text-stone-400 font-normal">Optional</span>
            </button>

            {showDetails && (
              <div className="mt-3.5 space-y-4 pt-1">
                {/* Category Chips */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-1.5">
                    Category
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[
                      { key: "coffee", label: "Coffee", icon: Coffee },
                      { key: "restaurant", label: "Dining", icon: Utensils },
                      { key: "bakery", label: "Bakery", icon: Croissant },
                      { key: "bar", label: "Bar", icon: Wine },
                      { key: "other", label: "Other", icon: MapPin },
                    ].map((cat) => {
                      const Icon = cat.icon;
                      const isSelected = category === cat.key;
                      return (
                        <button
                          key={cat.key}
                          type="button"
                          onClick={() => setCategory(cat.key as SpotCategory)}
                          className={`min-h-[44px] py-2 px-1 rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1 border transition-all cursor-pointer ${
                            isSelected
                              ? "bg-amber-100 dark:bg-amber-950/80 text-amber-950 dark:text-amber-200 border-amber-300 dark:border-amber-700 shadow-2xs"
                              : "bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 border-stone-200/70 dark:border-stone-700"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          <span className="text-[11px]">{cat.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Price Range */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-1">
                    Price Range
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["₱", "₱₱", "₱₱₱"] as const).map((tier) => (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => setBudget(budget === tier ? undefined : tier)}
                        className={`min-h-[44px] py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                          budget === tier
                            ? "bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 shadow-2xs"
                            : "bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700"
                        }`}
                      >
                        {tier}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Photos */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                      Photos
                    </label>
                    {photos.length > 0 && (
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                        {photos.length} photo(s) attached
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2.5">
                      {photoPreviews.map((preview, i) => (
                        <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-stone-200 dark:border-stone-700 group shadow-xs">
                          <img src={preview} alt="" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removePhoto(i)}
                            aria-label="Remove photo"
                            className="absolute -top-1 -right-1 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer z-10"
                          >
                            <span className="w-6 h-6 bg-black/80 text-white rounded-full flex items-center justify-center shadow-xs hover:bg-black transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </span>
                          </button>
                        </div>
                      ))}

                      <label className="min-w-[80px] min-h-[80px] w-20 h-20 rounded-xl border-2 border-dashed border-stone-300 dark:border-stone-700 hover:border-amber-600 dark:hover:border-amber-500 flex flex-col items-center justify-center gap-1 text-stone-500 dark:text-stone-400 hover:text-amber-700 dark:hover:text-amber-400 cursor-pointer transition-colors bg-stone-50 dark:bg-stone-800/80">
                        <Camera className="w-6 h-6" />
                        <span className="text-[10px] font-bold">+ Upload</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handlePhotoUpload}
                          className="hidden"
                          disabled={processingPhoto}
                        />
                      </label>
                    </div>

                    {processingPhoto && (
                      <p className="text-xs text-amber-700 dark:text-amber-400 animate-pulse font-medium">
                        Optimizing photos offline…
                      </p>
                    )}
                  </div>
                </div>

                {/* Vibe Tags: ONLY shown for Been Here visits, not Want to Try */}
                {mode === "visit" && (
                  <div>
                    <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-1.5">
                      Vibes & Perks
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {vibeTags.map((tag) => {
                        const active = selectedVibes.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() =>
                              setSelectedVibes((prev) =>
                                active ? prev.filter((t) => t !== tag) : [...prev, tag]
                              )
                            }
                            className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer capitalize ${
                              active
                                ? "bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 font-semibold"
                                : "bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700"
                            }`}
                          >
                            {tag.replaceAll("-", " ")}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Date & Spend (Only when Been Here) */}
                {mode === "visit" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-1">
                        Date Visited
                      </label>
                      <input
                        type="datetime-local"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full h-11 px-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-base md:text-xs text-stone-800 dark:text-stone-100 outline-none focus:border-amber-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-1">
                        Total Spend (₱)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="e.g. 450"
                        value={spend}
                        onChange={(e) => setSpend(e.target.value)}
                        className="w-full h-11 px-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-base md:text-xs text-stone-800 dark:text-stone-100 outline-none focus:border-amber-600 placeholder:text-stone-400"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Duplicate Warning */}
          {duplicateWarning && (
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200 space-y-2">
              <p className="font-semibold">
                You already saved “{duplicateWarning.name}”. Log a new visit to this existing venue?
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSave(duplicateWarning.id)}
                  disabled={saving}
                  className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white font-semibold rounded-lg text-xs cursor-pointer shadow-xs"
                >
                  Yes, add visit to existing venue
                </button>
                <button
                  type="button"
                  onClick={() => setDuplicateWarning(null)}
                  className="px-3 py-1.5 text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white text-xs cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-2.5 rounded-xl font-medium">
              {error}
            </p>
          )}
        </div>

        {/* Modal Footer with Single Cancel Button & Clear Action Copy */}
        <div className="px-4 sm:px-5 py-3 sm:py-3.5 border-t border-stone-200/80 dark:border-stone-800 bg-[#FAF7F2] dark:bg-[#15110F] flex items-center justify-end gap-2.5 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white hover:bg-stone-200/60 dark:hover:bg-stone-800 rounded-xl transition-colors cursor-pointer flex items-center justify-center"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving || processingPhoto}
            className={`min-h-[44px] px-5 py-2.5 text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 text-white ${
              mode === "wishlist"
                ? "bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800"
                : "bg-amber-700 hover:bg-amber-800 active:bg-amber-900"
            }`}
          >
            {saving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Saving…</span>
              </>
            ) : mode === "wishlist" ? (
              <>
                <Bookmark className="w-3.5 h-3.5" />
                <span>Save to Want to Try</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Save Visit</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
