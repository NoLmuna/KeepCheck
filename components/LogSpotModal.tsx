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
  Search,
  Check,
  Bookmark,
  Sparkles,
  Upload,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { Spot, SpotCollection, SpotCategory, MenuItemNote } from "@/lib/models";
import { vibeTags } from "@/lib/models";
import { searchVenues } from "@/lib/osm";
import { haversine, humanReadableLocation, type Coordinates, type Venue } from "@/lib/geo";
import {
  saveJournalEntry,
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
  const { user } = useAuth();
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
        : "Location not recorded")
  );
  const [locality, setLocality] = useState(initialVenue?.location.locality ?? "");
  const [osmId, setOsmId] = useState<string | undefined>(
    initialVenue?.location.osmId
  );
  const [coords, setCoords] = useState<Coordinates>(
    initialVenue?.location ?? position ?? { lat: 0, lng: 0 }
  );

  // Search autocomplete for new venue name
  const [searchResults, setSearchResults] = useState<Venue[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Visit specifics
  const [rating, setRating] = useState(5);
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

  // Photos
  const [photos, setPhotos] = useState<VisitDraft["photos"]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [processingPhoto, setProcessingPhoto] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<Spot | null>(null);

  // Search Photon when user types venue name
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
      setError(err instanceof Error ? err.message : "Failed to process photo.");
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
      const targetVenue: Venue = initialVenue ?? {
        key: `venue-${coords.lat}-${coords.lng}-${name}`,
        name: name.trim(),
        category,
        location: {
          lat: coords.lat,
          lng: coords.lng,
          formattedAddress: address,
          locality: locality || undefined,
          osmId,
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

      const draft: SpotDraft = {
        name: name.trim(),
        category,
        status: mode === "wishlist" ? "wishlist" : "visited",
        vibeTags: selectedVibes,
        menuItems,
        budgetTier: budget,
        collectionIds: selectedCollections,
      };

      // In visit mode OR if photos are attached to wishlist, create a visit entry
      let visit: VisitDraft | undefined = undefined;
      if (mode === "visit" || photos.length > 0) {
        visit = {
          rating: mode === "visit" ? rating : 5,
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
        user?.uid,
        forceDuplicateId
      );

      showToast(
        mode === "wishlist" ? `Added "${savedSpot.name}" to Wishlist` : `Saved visit to "${savedSpot.name}"`,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Log spot modal"
        className="relative w-full max-w-lg max-h-[90dvh] bg-white dark:bg-[#1c1612] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 flex flex-col overflow-hidden animate-page-enter"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-200/80 dark:border-stone-800 flex items-center justify-between shrink-0 bg-[#F8F6F2] dark:bg-[#120e0b]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-600" />
            <h2 className="font-serif font-bold text-lg text-stone-900 dark:text-white">
              {mode === "visit" ? "Save Place · Been Here" : "Save Place · Want to Try"}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/50 dark:hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-stone-900 dark:text-stone-100">
          {/* Segmented Status Selector: Been Here vs Want to Try */}
          <div className="grid grid-cols-2 p-1 bg-stone-100 dark:bg-stone-800 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMode("visit")}
              className={`py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                mode === "visit"
                  ? "bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-xs font-bold"
                  : "text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200"
              }`}
            >
              <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
              <span>Been Here</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("wishlist")}
              className={`py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                mode === "wishlist"
                  ? "bg-white dark:bg-stone-900 text-indigo-700 dark:text-indigo-400 shadow-xs font-bold"
                  : "text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200"
              }`}
            >
              <Bookmark className="w-3.5 h-3.5 fill-indigo-600 dark:fill-indigo-400 text-indigo-600 dark:text-indigo-400" />
              <span>Want to Try</span>
            </button>
          </div>

          {/* Step 1: Place Name & Search Autocomplete */}
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
                className="w-full h-11 px-3.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20 text-sm outline-none transition-all placeholder:text-stone-400"
                autoFocus={!initialVenue}
              />
              {searching && (
                <div className="absolute right-3.5 top-3.5 w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
              )}
            </div>

            {/* Photon autocomplete dropdown */}
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

          {/* Location details summary badge */}
          <div className="p-2.5 bg-stone-50 dark:bg-stone-800/60 rounded-xl border border-stone-200/70 dark:border-stone-700 text-xs flex items-center gap-2 text-stone-600 dark:text-stone-400">
            <MapPin className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
            <span className="truncate">
              {humanReadableLocation({ lat: coords.lat, lng: coords.lng, formattedAddress: address, locality })}
            </span>
          </div>

          {/* Step 2: Rating (Only when Been Here) */}
          {mode === "visit" && (
            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-1.5">
                Your Rating
              </label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1 hover:scale-110 active:scale-95 transition-transform cursor-pointer"
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
                <span className="text-xs font-semibold text-stone-600 dark:text-stone-300 ml-2">
                  {rating === 5
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

          {/* Step 3: Quick Note / What did you order */}
          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-1">
              What did you order or love here?
            </label>
            <input
              type="text"
              value={mustOrder}
              onChange={(e) => setMustOrder(e.target.value)}
              placeholder="e.g. Spanish Latte, Truffle Pasta, Sourdough…"
              className="w-full h-11 px-3.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20 text-xs outline-none placeholder:text-stone-400"
            />
          </div>

          {/* Optional Collapsible Section */}
          <div className="pt-2 border-t border-stone-200/70 dark:border-stone-800">
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="w-full py-2.5 px-3.5 rounded-xl bg-stone-100 hover:bg-stone-200/80 dark:bg-stone-800 dark:hover:bg-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-300 flex items-center justify-between transition-colors cursor-pointer"
            >
              <span className="font-bold">
                {showDetails ? "− Hide extra details" : "+ Add photos, Wi-Fi tags & price"}
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
                          className={`py-2 px-1 rounded-xl text-xs font-semibold flex flex-col items-center gap-1 border transition-all cursor-pointer ${
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

                {/* Photo Upload Section */}
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
                            className="absolute top-1 right-1 w-5 h-5 bg-black/70 text-white rounded-full flex items-center justify-center hover:bg-black transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}

                      <label className="w-20 h-20 rounded-xl border-2 border-dashed border-stone-300 dark:border-stone-700 hover:border-amber-600 dark:hover:border-amber-500 flex flex-col items-center justify-center gap-1 text-stone-500 dark:text-stone-400 hover:text-amber-700 dark:hover:text-amber-400 cursor-pointer transition-colors bg-stone-50 dark:bg-stone-800/80">
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

                {/* Budget Tier */}
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
                        className={`py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
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

                {/* Vibe Tags */}
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
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer capitalize ${
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

                {/* Additional notes & total spend */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-1">
                      Date Visited
                    </label>
                    <input
                      type="datetime-local"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs text-stone-800 dark:text-stone-100 outline-none focus:border-amber-600"
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
                      className="w-full h-10 px-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs text-stone-800 dark:text-stone-100 outline-none focus:border-amber-600 placeholder:text-stone-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-1">
                    Notes & Memories
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Atmosphere, seating, who you went with…"
                    className="w-full p-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:border-amber-600 text-xs outline-none placeholder:text-stone-400 resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Duplicate Venue Warning Card */}
          {duplicateWarning && (
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200 space-y-2">
              <p className="font-semibold">
                You already saved “{duplicateWarning.name}”. Would you like to log a new visit to this existing venue?
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

          {/* Error Message */}
          {error && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-2.5 rounded-xl font-medium">
              {error}
            </p>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-stone-200/80 dark:border-stone-800 bg-[#F8F6F2] dark:bg-[#120e0b] flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white hover:bg-stone-200/60 dark:hover:bg-stone-800 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving || processingPhoto}
            className={`px-5 py-2.5 text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5 ${
              mode === "wishlist"
                ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                : "bg-amber-700 hover:bg-amber-800 text-white"
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
                <span>Save Spot</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
