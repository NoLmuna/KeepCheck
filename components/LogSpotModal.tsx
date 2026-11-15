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
} from "lucide-react";
import type { Spot, SpotCollection, SpotCategory, MenuItemNote } from "@/lib/models";
import { vibeTags } from "@/lib/models";
import { searchVenues } from "@/lib/osm";
import { haversine, type Coordinates, type Venue } from "@/lib/geo";
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

  // Search Photon when user types venue name (if not already selecting an established initial venue)
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
        // Search aborted or network failure — fail silently
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

      let visit: VisitDraft | undefined = undefined;
      if (mode === "visit") {
        visit = {
          rating,
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
        mode === "wishlist" ? `🔖 Added "${savedSpot.name}" to Wishlist` : `★ Logged visit to "${savedSpot.name}"!`,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/40 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Log spot modal"
        className="relative w-full max-w-lg max-h-[90dvh] bg-white rounded-2xl shadow-xl border border-stone-200 flex flex-col overflow-hidden animate-page-enter"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between shrink-0 bg-[#F8F6F2]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-600" />
            <h2 className="font-serif font-bold text-lg text-stone-900">
              {mode === "visit" ? "Log Spot Visit" : "Save to Wishlist"}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-200/50 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-stone-900">
          {/* Segmented Mode Selector: Visited vs Wishlist */}
          <div className="grid grid-cols-2 p-1 bg-stone-100 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMode("visit")}
              className={`py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                mode === "visit"
                  ? "bg-white text-stone-900 shadow-xs"
                  : "text-stone-500 hover:text-stone-800"
              }`}
            >
              <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
              <span>Log Visited</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("wishlist")}
              className={`py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                mode === "wishlist"
                  ? "bg-white text-indigo-700 shadow-xs"
                  : "text-stone-500 hover:text-stone-800"
              }`}
            >
              <Bookmark className="w-3.5 h-3.5 fill-indigo-600 text-indigo-600" />
              <span>Wishlist / Want to Go</span>
            </button>
          </div>

          {/* Venue Name & Live Place Search Autocomplete */}
          <div className="relative">
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
              Venue Name *
            </label>
            <div className="relative">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Yardstick Coffee, Wildflour Café…"
                className="w-full h-11 px-3.5 rounded-xl border border-stone-300 focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20 text-sm outline-none transition-all placeholder:text-stone-400"
                autoFocus={!initialVenue}
              />
              {searching && (
                <div className="absolute right-3.5 top-3 w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
              )}
            </div>

            {/* Photon autocomplete dropdown */}
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-30 max-h-48 overflow-y-auto bg-white border border-stone-200 rounded-xl shadow-lg divide-y divide-stone-100">
                {searchResults.slice(0, 5).map((res) => (
                  <button
                    key={res.key}
                    type="button"
                    onClick={() => handleSelectResult(res)}
                    className="w-full p-2.5 text-left hover:bg-stone-50 flex items-start gap-2.5 transition-colors cursor-pointer"
                  >
                    <MapPin className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-stone-900 truncate">{res.name}</p>
                      <p className="text-[11px] text-stone-500 truncate">
                        {res.location.locality || res.location.formattedAddress}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Category Chips */}
          <div>
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
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
                        ? "bg-amber-100 text-amber-950 border-amber-300 shadow-2xs"
                        : "bg-stone-50 hover:bg-stone-100 text-stone-600 border-stone-200/70"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-[11px]">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Location details summary */}
          <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/70 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-medium text-stone-700">
              <MapPin className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span className="truncate">{address}</span>
            </div>
            {locality && <p className="text-stone-500 pl-5 text-[11px]">{locality}</p>}
          </div>

          {/* If Visited Mode: Rating, Date, Notes, Photos, Spend */}
          {mode === "visit" && (
            <>
              {/* Star Rating (1 to 5) */}
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  Rating: {rating} / 5
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
                            : "text-stone-300"
                        }`}
                      />
                    </button>
                  ))}
                  <span className="text-xs font-semibold text-stone-600 ml-2">
                    {rating === 5
                      ? "Outstanding"
                      : rating === 4
                        ? "Great spot"
                        : rating === 3
                          ? "Good"
                          : rating === 2
                            ? "Fair"
                            : "Not great"}
                  </span>
                </div>
              </div>

              {/* Date & Total Spend */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Visited Date
                  </label>
                  <input
                    type="datetime-local"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-stone-300 text-xs text-stone-800 outline-none focus:border-amber-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Total Spend (₱)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 450"
                    value={spend}
                    onChange={(e) => setSpend(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-stone-300 text-xs text-stone-800 outline-none focus:border-amber-600 placeholder:text-stone-400"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Visit Notes & Memories
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Atmosphere, seating, coffee notes, who you went with…"
                  className="w-full p-3 rounded-xl border border-stone-300 focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20 text-xs outline-none placeholder:text-stone-400 resize-none"
                />
              </div>

              {/* Photos upload */}
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Photos (Offline Compressed)
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {photoPreviews.map((preview, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-stone-200 group">
                      <img src={preview} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  <label className="w-16 h-16 rounded-xl border-2 border-dashed border-stone-300 hover:border-amber-600 flex flex-col items-center justify-center gap-1 text-stone-500 hover:text-amber-700 cursor-pointer transition-colors bg-stone-50">
                    <Camera className="w-5 h-5" />
                    <span className="text-[9px] font-semibold">Add</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePhotoUpload}
                      className="hidden"
                      disabled={processingPhoto}
                    />
                  </label>
                  {processingPhoto && (
                    <span className="text-xs text-amber-700 animate-pulse font-medium">
                      Compressing…
                    </span>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Must Order highlight */}
          <div>
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
              Must Order Item / Signature Dish
            </label>
            <input
              type="text"
              value={mustOrder}
              onChange={(e) => setMustOrder(e.target.value)}
              placeholder="e.g. Spanish Latte, Truffle Pasta, Sourdough…"
              className="w-full h-10 px-3 rounded-xl border border-stone-300 focus:border-amber-600 text-xs outline-none placeholder:text-stone-400"
            />
          </div>

          {/* Budget Tier */}
          <div>
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
              Budget Tier
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["₱", "₱₱", "₱₱₱"] as const).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setBudget(budget === tier ? undefined : tier)}
                  className={`py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                    budget === tier
                      ? "bg-amber-100 text-amber-900 border-amber-300 shadow-2xs"
                      : "bg-stone-50 hover:bg-stone-100 text-stone-600 border-stone-200"
                  }`}
                >
                  {tier}
                </button>
              ))}
            </div>
          </div>

          {/* Vibe Tags */}
          <div>
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
              Vibes & Amenities
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
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                      active
                        ? "bg-amber-100 text-amber-900 border-amber-300"
                        : "bg-stone-50 hover:bg-stone-100 text-stone-600 border-stone-200"
                    }`}
                  >
                    {tag.replaceAll("-", " ")}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duplicate Venue Warning Card */}
          {duplicateWarning && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-2">
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
                  className="px-3 py-1.5 text-stone-600 hover:text-stone-900 text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 p-2.5 rounded-xl font-medium">
              {error}
            </p>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-stone-200 bg-[#F8F6F2] flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-200/60 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving || processingPhoto}
            className={`px-5 py-2 text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5 ${
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
                <span>Save to Wishlist</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Log Visit</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
