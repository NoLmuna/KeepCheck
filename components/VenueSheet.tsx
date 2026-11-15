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
  ExternalLink,
  Footprints,
  Car,
  X,
  Check,
  Calendar,
  Camera,
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
  type Coordinates,
  type Venue,
} from "@/lib/geo";
import {
  DuplicateVenueError,
  deleteVenue,
  type SpotDraft,
  type VisitDraft,
} from "@/lib/journal";
import { compressVisitPhoto, shareCard } from "@/lib/journalMedia";
import JournalPhoto from "./JournalPhoto";

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
  const [collections, setCollections] = useState(spot?.collectionIds ?? []);
  const [menu, setMenu] = useState<MenuItemNote[]>(spot?.menuItems ?? []);
  const [menuName, setMenuName] = useState(""),
    [verdict, setVerdict] = useState<"must-order" | "skip">("must-order"),
    [price, setPrice] = useState("");
  const [rating, setRating] = useState(5),
    [date, setDate] = useState(() => {
      const d = new Date();
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    });
  const [notes, setNotes] = useState(""),
    [items, setItems] = useState(""),
    [spend, setSpend] = useState("");
  const [photos, setPhotos] = useState<VisitDraft["photos"]>([]),
    [processing, setProcessing] = useState(false),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  const [duplicate, setDuplicate] = useState<Spot | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    heading.current?.focus();
    return () => {
      mounted.current = false;
    };
  }, []);

  const draft: SpotDraft = {
    name,
    category,
    status: action === "wishlist" ? "wishlist" : (spot?.status ?? "visited"),
    vibeTags: vibes,
    menuItems: menu,
    collectionIds: collections,
    ...(budget
      ? { budgetTier: budget as Spot["budgetTier"] }
      : { budgetTier: undefined }),
  };

  async function save(duplicateId?: string) {
    if (saving || processing) return;
    setSaving(true);
    setMessage("");
    try {
      const visit =
        action === "visit"
          ? {
              rating,
              visitedAt: new Date(date).getTime(),
              notes,
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
      setNotes("");
      setItems("");
      setSpend("");
      setMessage("Saved on this device");
    } catch (e) {
      if (e instanceof DuplicateVenueError) setDuplicate(e.spot);
      else
        setMessage(
          e instanceof Error ? e.message : "Could not save. Try again.",
        );
    } finally {
      setSaving(false);
    }
  }

  const { lat, lng } = p.venue.location;
  const isWishlist = spot?.status === "wishlist";

  return (
    <section
      role="region"
      aria-label={`Venue details: ${p.venue.name}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          p.onClose();
        }
      }}
      data-expanded={expanded}
      data-embedded={!!p.embedded}
      className={`venue-detail flex flex-col bg-white text-stone-900 border-stone-200 ${
        p.embedded ? "h-full w-full border-0" : "rounded-t-2xl sm:rounded-2xl shadow-xl"
      }`}
    >
      {/* Mobile Drawer Grabber / Toggle */}
      {!p.embedded && (
        <button
          type="button"
          className="sheet-toggle md:hidden w-full py-2 flex flex-col items-center justify-center cursor-pointer shrink-0"
          aria-label={expanded ? "Collapse venue details" : "Expand venue details"}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="w-12 h-1.5 rounded-full bg-stone-300" />
        </button>
      )}

      {/* Header Bar */}
      <div className="p-4 border-b border-stone-200/80 bg-[#F8F6F2] shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                isWishlist
                  ? "bg-indigo-100 text-indigo-800"
                  : "bg-amber-100 text-amber-900"
              }`}
            >
              <CategoryIcon category={p.venue.category} className="w-5 h-5" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-600 bg-stone-200/60 px-1.5 py-0.5 rounded">
                  {p.venue.category}
                </span>
                {spot?.status && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      isWishlist
                        ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                        : "bg-amber-50 text-amber-900 border border-amber-200"
                    }`}
                  >
                    {isWishlist ? "🔖 Wishlist" : "✓ Visited"}
                  </span>
                )}
                {spot?.budgetTier && (
                  <span className="text-[10px] font-bold text-stone-600 bg-stone-200/60 px-1.5 py-0.5 rounded">
                    {spot.budgetTier}
                  </span>
                )}
              </div>

              <h2
                ref={heading}
                tabIndex={-1}
                className="text-lg sm:text-xl font-serif font-bold text-stone-900 mt-1 truncate outline-none"
              >
                {spot?.name ?? p.venue.name}
              </h2>

              <p className="text-xs text-stone-500 truncate mt-0.5 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                <span>{p.venue.location.locality || p.venue.location.formattedAddress}</span>
                {p.position && !spot?.locationMissing && (
                  <span className="font-semibold text-stone-700">
                    {" "}· {formatDistance(haversine(p.position, p.venue.location))} away
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {spot?.overallRating && (
              <div className="flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-full text-xs font-bold">
                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                <span>{spot.overallRating.toFixed(1)}</span>
              </div>
            )}
            <button
              type="button"
              aria-label="Close venue details"
              onClick={p.onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-500 hover:text-stone-800 hover:bg-stone-200/60 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 md:inline hidden" />
              <X className="w-4 h-4 md:hidden inline" />
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="venue-detail-body flex-1 overflow-y-auto p-4 space-y-4">
        {/* Cover Photo if available */}
        {(spot?.localCoverPhotoId || spot?.coverPhotoUrl) && (
          <div className="rounded-xl overflow-hidden border border-stone-200 shadow-xs max-h-48">
            <JournalPhoto
              id={spot.localCoverPhotoId}
              url={spot.coverPhotoUrl}
              alt={`${spot.name} cover`}
            />
          </div>
        )}

        {/* Action Row: Routes, Navigation & Quick Log */}
        {!spot?.locationMissing && (
          <div className="p-3 bg-[#F8F6F2] rounded-xl border border-stone-200/80 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {/* OSRM In-App Route Button */}
              {p.onRoute && (
                <div className="flex items-center gap-1.5">
                  <div className="inline-flex rounded-lg border border-stone-300 bg-white p-0.5 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => p.onMode?.("foot")}
                      className={`px-2 py-1 rounded-md flex items-center gap-1 cursor-pointer ${
                        p.routeMode === "foot" ? "bg-amber-100 text-amber-900 font-bold" : "text-stone-600"
                      }`}
                    >
                      <Footprints className="w-3.5 h-3.5" />
                      <span>Walk</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => p.onMode?.("driving")}
                      className={`px-2 py-1 rounded-md flex items-center gap-1 cursor-pointer ${
                        p.routeMode === "driving" ? "bg-amber-100 text-amber-900 font-bold" : "text-stone-600"
                      }`}
                    >
                      <Car className="w-3.5 h-3.5" />
                      <span>Drive</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    aria-label={p.showRoute ? "Dismiss route" : "Show route"}
                    aria-pressed={!!p.showRoute}
                    disabled={!p.showRoute && (!p.position || !p.online)}
                    onClick={p.onRoute}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                      p.showRoute
                        ? "bg-amber-600 text-white border-amber-700"
                        : "bg-white text-stone-800 border-stone-300 hover:bg-stone-50"
                    }`}
                  >
                    {p.showRoute ? "Hide Route" : "Show Route"}
                  </button>
                </div>
              )}

              {/* External Navigation Links */}
              <div className="flex items-center gap-1.5">
                <a
                  aria-label="Navigate with Google Maps"
                  target="_blank"
                  rel="noopener noreferrer"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=${
                    p.routeMode === "driving" ? "driving" : "walking"
                  }`}
                  className="px-2.5 py-1.5 bg-white text-stone-800 text-xs font-semibold rounded-lg border border-stone-300 hover:bg-stone-50 transition-colors flex items-center gap-1"
                >
                  <Navigation className="w-3 h-3 text-amber-700" />
                  <span>Google Maps ↗</span>
                </a>
                <a
                  aria-label="Navigate with Waze"
                  target="_blank"
                  rel="noopener noreferrer"
                  href={`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`}
                  className="px-2.5 py-1.5 bg-white text-stone-800 text-xs font-semibold rounded-lg border border-stone-300 hover:bg-stone-50 transition-colors flex items-center gap-1"
                >
                  <span>Waze ↗</span>
                </a>
              </div>
            </div>

            {p.routeStatus && (
              <p role="status" className="text-[11px] font-medium text-amber-800 bg-amber-50 p-1.5 rounded border border-amber-200">
                {p.routeStatus}
              </p>
            )}
          </div>
        )}

        {/* Primary Action Buttons: Log Visit, Edit, Wishlist */}
        {!action && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-label={spot?.status === "wishlist" ? "Mark as Visited" : "Log Visit"}
              onClick={() => setAction("visit")}
              className="py-2.5 px-3 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{spot?.status === "wishlist" ? "Mark as Visited" : "+ Log Visit"}</span>
            </button>

            <button
              type="button"
              aria-label={spot ? "Edit venue" : "Save to Wishlist"}
              onClick={() => setAction(spot ? "edit" : "wishlist")}
              className={`py-2.5 px-3 text-xs font-bold rounded-xl border transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                spot
                  ? "bg-white text-stone-700 border-stone-300 hover:bg-stone-50"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white border-transparent"
              }`}
            >
              {spot ? (
                <>
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Venue</span>
                </>
              ) : (
                <>
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>Save to Wishlist</span>
                </>
              )}
            </button>

            {spot && (
              <div className="col-span-2 flex items-center gap-2 pt-1">
                <button
                  type="button"
                  aria-label="Share venue card"
                  onClick={() => {
                    void shareCard(spot.name, [
                      `${spot.overallRating ? `★ ${spot.overallRating.toFixed(1)}/5 · ` : ""}${
                        spot.location.locality ?? spot.location.formattedAddress
                      }`,
                      spot.vibeTags.map((v) => v.replaceAll("-", " ")).join(" · "),
                      ...spot.menuItems
                        .filter((m) => m.verdict === "must-order")
                        .map((m) => `Must order: ${m.name}`),
                    ]).catch(() => setMessage("Could not create share card"));
                  }}
                  className="flex-1 py-1.5 px-3 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share Card</span>
                </button>

                <button
                  type="button"
                  aria-label="Delete venue"
                  onClick={() => setConfirmDelete(true)}
                  className="py-1.5 px-3 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Delete Confirmation Card */}
        {confirmDelete && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-2">
            <p className="text-xs text-red-800 font-semibold">
              Delete this venue and its visit history? This cannot be undone.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Confirm delete venue"
                onClick={() => {
                  if (spot)
                    void deleteVenue(spot.id)
                      .then(p.onClose)
                      .catch(() => setMessage("Delete failed"));
                }}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg cursor-pointer"
              >
                Yes, Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 text-stone-600 hover:text-stone-900 text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Vibe Tags Pills */}
        {spot?.vibeTags && spot.vibeTags.length > 0 && !action && (
          <div>
            <h4 className="text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1.5">
              Vibes & Amenities
            </h4>
            <div className="flex flex-wrap gap-1">
              {spot.vibeTags.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 bg-stone-100 text-stone-700 rounded-lg text-xs font-medium capitalize"
                >
                  {tag.replaceAll("-", " ")}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Menu Memory Section */}
        {!action && (
          <div className="p-3.5 bg-amber-50/50 rounded-xl border border-amber-200/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="font-serif font-bold text-xs uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
                <Utensils className="w-3.5 h-3.5 text-amber-700" />
                <span>Menu Memory</span>
              </h4>
            </div>

            {spot?.menuItems && spot.menuItems.length > 0 ? (
              <div className="space-y-1.5">
                {spot.menuItems.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-amber-200/50 text-xs"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          m.verdict === "must-order" ? "bg-emerald-500" : "bg-stone-400"
                        }`}
                      />
                      <span className="font-semibold text-stone-900 truncate">{m.name}</span>
                      {m.price !== undefined && (
                        <span className="text-stone-500">· ₱{m.price}</span>
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        m.verdict === "must-order"
                          ? "bg-amber-100 text-amber-900"
                          : "bg-stone-100 text-stone-600"
                      }`}
                    >
                      {m.verdict === "must-order" ? "Must Order" : "Skip"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-stone-500 italic">No menu notes recorded yet.</p>
            )}

            {/* Quick Add Menu Item Inline */}
            <div className="pt-2 border-t border-amber-200/40 flex items-center gap-1.5">
              <input
                type="text"
                placeholder="Add dish/drink…"
                value={menuName}
                onChange={(e) => setMenuName(e.target.value)}
                className="flex-1 h-8 px-2.5 rounded-lg border border-stone-300 bg-white text-xs outline-none focus:border-amber-600"
              />
              <select
                value={verdict}
                onChange={(e) => setVerdict(e.target.value as "must-order" | "skip")}
                className="h-8 px-2 rounded-lg border border-stone-300 bg-white text-xs text-stone-800"
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
                    void p.onSave(p.venue, { ...draft, menuItems: updatedMenu });
                    setMenuName("");
                  }
                }}
                className="h-8 px-2.5 bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {/* Visit History Timeline */}
        {!action && (
          <div className="space-y-3 pt-2">
            <h4 className="font-serif font-bold text-sm text-stone-900 flex items-center justify-between">
              <span>Visit History</span>
              <span className="text-xs font-sans text-stone-500">
                {visits.length} {visits.length === 1 ? "visit" : "visits"}
              </span>
            </h4>

            {visits.length > 0 ? (
              <div className="space-y-3 relative pl-3 border-l-2 border-amber-200">
                {visits.map((v) => (
                  <div key={v.id} className="relative text-xs space-y-1">
                    <div className="absolute -left-[19px] top-1 w-3 h-3 rounded-full bg-amber-600 border-2 border-white ring-2 ring-amber-200" />
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-stone-900 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-stone-400" />
                        {new Date(v.visitedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      <div className="flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.5 rounded font-bold text-[11px]">
                        <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                        <span>{v.rating}</span>
                      </div>
                    </div>

                    {v.totalSpend !== undefined && (
                      <p className="text-stone-600 font-medium">Spent: ₱{v.totalSpend}</p>
                    )}

                    {v.itemsOrdered && v.itemsOrdered.length > 0 && (
                      <p className="text-stone-700">
                        <span className="font-semibold">Ordered:</span> {v.itemsOrdered.join(", ")}
                      </p>
                    )}

                    {v.notes && <p className="text-stone-600 italic">“{v.notes}”</p>}

                    {/* Photos in visit */}
                    {v.localPhotoIds.length > 0 && (
                      <div className="flex items-center gap-1.5 pt-1 overflow-x-auto">
                        {v.localPhotoIds.map((id, i) => (
                          <div key={id} className="w-14 h-14 rounded-lg overflow-hidden border border-stone-200 shrink-0">
                            <JournalPhoto
                              id={id}
                              url={v.photoUrls[i]}
                              alt={`Visit photo ${i + 1}`}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-stone-500 italic">No past visits recorded yet.</p>
            )}
          </div>
        )}

        {/* Action Form: Log a Visit, Edit Venue, or Save Wishlist */}
        {action && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="p-4 bg-stone-50 rounded-xl border border-stone-200 space-y-3.5"
          >
            <div className="flex items-center justify-between pb-2 border-b border-stone-200">
              <h3 className="font-serif font-bold text-sm text-stone-900">
                {action === "visit"
                  ? "Log a Visit"
                  : action === "wishlist"
                    ? "Save to Wishlist"
                    : "Edit Venue Details"}
              </h3>
              <button
                type="button"
                onClick={() => setAction(null)}
                className="text-xs text-stone-500 hover:text-stone-800"
              >
                Cancel
              </button>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-600 mb-1">
                Venue Name *
              </label>
              <input
                required
                aria-label="Venue name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-stone-300 bg-white text-xs outline-none focus:border-amber-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-600 mb-1">
                  Category
                </label>
                <select
                  aria-label="Venue category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Spot["category"])}
                  className="w-full h-9 px-2 rounded-lg border border-stone-300 bg-white text-xs"
                >
                  {["coffee", "restaurant", "bakery", "bar", "other"].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-600 mb-1">
                  Budget
                </label>
                <select
                  aria-label="Budget tier"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value as typeof budget)}
                  className="w-full h-9 px-2 rounded-lg border border-stone-300 bg-white text-xs"
                >
                  <option value="">Not set</option>
                  {["₱", "₱₱", "₱₱₱"].map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Visit Specifics Form */}
            {action === "visit" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-600 mb-1">
                      Visited At
                    </label>
                    <input
                      type="datetime-local"
                      required
                      aria-label="Visit date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full h-9 px-2 rounded-lg border border-stone-300 bg-white text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-600 mb-1">
                      Rating (1–5)
                    </label>
                    <div className="flex items-center gap-1 h-9">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setRating(s)}
                          className="p-0.5 cursor-pointer"
                        >
                          <Star
                            className={`w-5 h-5 ${
                              rating >= s ? "fill-amber-500 text-amber-500" : "text-stone-300"
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-600 mb-1">
                    Items Ordered
                  </label>
                  <input
                    aria-label="Items ordered"
                    placeholder="Separate with commas (e.g. Latte, Croissant)"
                    value={items}
                    onChange={(e) => setItems(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-stone-300 bg-white text-xs outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-600 mb-1">
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
                    className="w-full h-9 px-3 rounded-lg border border-stone-300 bg-white text-xs outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-600 mb-1">
                    Notes
                  </label>
                  <textarea
                    rows={2}
                    aria-label="Visit notes"
                    placeholder="What did you think of the coffee and vibe?"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-stone-300 bg-white text-xs outline-none resize-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-600 mb-1">
                    Photos
                  </label>
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
                        const compressed: VisitDraft["photos"] = [];
                        for (const f of files.slice(0, 6))
                          compressed.push(await compressVisitPhoto(f));
                        if (mounted.current)
                          setPhotos((old) => [...old, ...compressed].slice(0, 6));
                      } catch {
                        if (mounted.current)
                          setMessage("Could not process photo.");
                      } finally {
                        if (mounted.current) setProcessing(false);
                      }
                    }}
                    className="text-xs text-stone-600"
                  />
                  {photos.length > 0 && (
                    <p className="text-[11px] text-amber-800 mt-1">
                      {photos.length} photo(s) attached
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Vibe Tags selector */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-600 mb-1.5">
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
                        ? "bg-amber-100 text-amber-900 border-amber-300 font-semibold"
                        : "bg-white text-stone-600 border-stone-200"
                    }`}
                  >
                    {v.replaceAll("-", " ")}
                  </button>
                ))}
              </div>
            </div>

            {/* Duplicate Notice */}
            {duplicate && (
              <div role="alert" className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-2">
                <p className="font-semibold text-amber-900">
                  You already saved {duplicate.name} — log a new visit to it?
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAction("visit");
                      if (action === "visit") void save(duplicate.id);
                    }}
                    className="px-3 py-1 bg-amber-700 text-white rounded text-xs font-semibold cursor-pointer"
                  >
                    Save visit to existing
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuplicate(null)}
                    className="text-xs text-stone-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200">
              <button
                type="button"
                onClick={() => setAction(null)}
                className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || processing}
                className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        )}

        {message && (
          <p role="status" className="text-xs text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
