"use client";
import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
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
  const [rating, setRating] = useState(4),
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
      className="journal-sheet venue-detail"
    >
      <button
        className="sheet-toggle"
        aria-label={
          expanded ? "Collapse venue details" : "Expand venue details"
        }
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "⌄ Collapse" : "⌃ View details"}
      </button>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-secondary">
            {spot?.status ?? "Discover"} · {p.venue.category}
          </p>
          <h2
            ref={heading}
            tabIndex={-1}
            className="text-2xl font-serif font-bold"
          >
            {spot?.name ?? p.venue.name}
          </h2>
          <p>
            {spot?.overallRating
              ? `★ ${spot.overallRating.toFixed(1)} / 5`
              : ""}{" "}
            {spot?.budgetTier}
          </p>
        </div>
        <button aria-label="Close venue details" onClick={p.onClose}>
          <span className="md:hidden">✕</span>
          <span className="hidden md:inline">← Back to list</span>
        </button>
      </div>
      <div className="venue-detail-body">
        <p className="mt-2 text-sm">{p.venue.location.formattedAddress}</p>
        {p.venue.cuisine && <p className="text-sm">{p.venue.cuisine}</p>}
        {p.position && !spot?.locationMissing && (
          <p className="text-sm">
            {formatDistance(haversine(p.position, p.venue.location))} away ·
            straight line
          </p>
        )}
        {!!spot?.vibeTags.length && (
          <p className="my-2 text-sm">
            {spot.vibeTags.map((v) => v.replaceAll("-", " ")).join(" · ")}
          </p>
        )}
        {(spot?.localCoverPhotoId || spot?.coverPhotoUrl) && (
          <JournalPhoto
            id={spot.localCoverPhotoId}
            url={spot.coverPhotoUrl}
            alt={`${spot.name} cover`}
          />
        )}
        {!!spot?.menuItems.length && (
          <div className="my-3 rounded-xl bg-accent/10 p-3">
            <h3 className="font-semibold">Menu memory</h3>
            {spot.menuItems.map((m) => (
              <p key={m.id} className="text-sm">
                {m.verdict === "must-order" ? "✓ Must order" : "− Skip"} ·{" "}
                {m.name}
                {m.price !== undefined ? ` · ₱${m.price}` : ""}
              </p>
            ))}
          </div>
        )}
        {!spot?.locationMissing && (
          <>
            <div className="my-3 flex flex-wrap gap-2">
              <a
                aria-label="Navigate with Google Maps"
                target="_blank"
                rel="noopener noreferrer"
                href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=${p.routeMode === "driving" ? "driving" : "walking"}`}
              >
                Google Maps ↗
              </a>
              <a
                aria-label="Navigate with Waze"
                target="_blank"
                rel="noopener noreferrer"
                href={`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`}
              >
                Waze ↗
              </a>
            </div>
            {p.onRoute ? (
              <div className="flex flex-wrap gap-2">
                <select
                  aria-label="Route travel mode"
                  value={p.routeMode}
                  onChange={(e) =>
                    p.onMode?.(e.target.value as "foot" | "driving")
                  }
                >
                  <option value="foot">Walking</option>
                  <option value="driving">Driving</option>
                </select>
                <button
                  aria-label={p.showRoute ? "Dismiss route" : "Show route"}
                  aria-pressed={!!p.showRoute}
                  disabled={!p.showRoute && (!p.position || !p.online)}
                  onClick={p.onRoute}
                >
                  {p.showRoute ? "Dismiss route" : "Show Route"}
                </button>
              </div>
            ) : (
              spot && (
                <a
                  href={`/map#spot=${encodeURIComponent(spot.id)}`}
                  aria-label="Open venue on map"
                >
                  Open map & route →
                </a>
              )
            )}
            <p role="status" className="text-xs">
              {p.routeStatus ||
                (!p.online
                  ? "Offline · new routes need a connection"
                  : !p.position
                    ? "Enable GPS for distances and routes"
                    : "")}
            </p>
          </>
        )}
        {!action && (
          <div className="my-3 grid grid-cols-2 gap-2">
            <button
              aria-label={
                spot?.status === "wishlist" ? "Mark as Visited" : "Log Visit"
              }
              className="journal-primary"
              onClick={() => setAction("visit")}
            >
              {spot?.status === "wishlist" ? "Mark as Visited" : "Log Visit"}
            </button>
            <button
              aria-label={spot ? "Edit venue" : "Save to Wishlist"}
              onClick={() => setAction(spot ? "edit" : "wishlist")}
            >
              {spot ? "Edit venue" : "Save to Wishlist"}
            </button>
            {spot && (
              <>
                <button
                  aria-label="Share venue card"
                  onClick={() => {
                    void shareCard(spot.name, [
                      `${spot.overallRating ? `★ ${spot.overallRating.toFixed(1)}/5 · ` : ""}${spot.location.locality ?? spot.location.formattedAddress}`,
                      spot.vibeTags
                        .map((v) => v.replaceAll("-", " "))
                        .join(" · "),
                      ...spot.menuItems
                        .filter((m) => m.verdict === "must-order")
                        .map((m) => `Must order: ${m.name}`),
                    ]).catch(() => setMessage("Could not create share card"));
                  }}
                >
                  Share Card
                </button>
                <button
                  aria-label="Delete venue"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete venue
                </button>
              </>
            )}
          </div>
        )}
        {confirmDelete && (
          <div className="my-3 rounded-xl border p-3">
            <p>Delete this venue and its visit history?</p>
            <button
              aria-label="Confirm delete venue"
              onClick={() => {
                if (spot)
                  void deleteVenue(spot.id)
                    .then(p.onClose)
                    .catch(() => setMessage("Delete failed"));
              }}
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              aria-label="Cancel deletion"
            >
              Cancel
            </button>
          </div>
        )}
        {action && (
          <form
            className="my-3 grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <h3 className="font-semibold">
              {action === "visit"
                ? "Log a visit"
                : action === "wishlist"
                  ? "Save to Wishlist"
                  : "Edit venue"}
            </h3>
            <label>
              Venue name
              <input
                required
                aria-label="Venue name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label>
                Category
                <select
                  aria-label="Venue category"
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as Spot["category"])
                  }
                >
                  {["coffee", "restaurant", "bakery", "bar", "other"].map(
                    (c) => (
                      <option key={c}>{c}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Budget
                <select
                  aria-label="Budget tier"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value as typeof budget)}
                >
                  <option value="">Not set</option>
                  {["₱", "₱₱", "₱₱₱"].map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </label>
            </div>
            {action === "edit" && (
              <label>
                Status
                <select
                  aria-label="Venue status"
                  value={draft.status}
                  onChange={(e) => {
                    if (e.target.value === "wishlist") setAction("wishlist");
                    else setAction("visit");
                  }}
                >
                  <option value="visited">Visited</option>
                  <option value="wishlist">Wishlist</option>
                </select>
              </label>
            )}
            <fieldset>
              <legend>Vibes & utilities</legend>
              <div className="flex flex-wrap gap-1">
                {vibeTags.map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-label={`Vibe ${v.replaceAll("-", " ")}`}
                    aria-pressed={vibes.includes(v)}
                    onClick={() =>
                      setVibes((old) =>
                        old.includes(v)
                          ? old.filter((x) => x !== v)
                          : [...old, v],
                      )
                    }
                  >
                    {v.replaceAll("-", " ")}
                  </button>
                ))}
              </div>
            </fieldset>
            {!!p.collections.length && (
              <fieldset>
                <legend>Collections</legend>
                {p.collections.map((c) => (
                  <label key={c.id} className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label={`Collection ${c.name}`}
                      checked={collections.includes(c.id)}
                      onChange={() =>
                        setCollections((old) =>
                          old.includes(c.id)
                            ? old.filter((id) => id !== c.id)
                            : [...old, c.id],
                        )
                      }
                    />
                    {c.name}
                  </label>
                ))}
              </fieldset>
            )}
            <fieldset className="grid gap-2">
              <legend>Menu memory</legend>
              {menu.map((m) => (
                <div
                  key={m.id}
                  className="flex justify-between items-center text-sm"
                >
                  <span>
                    {m.name} · {m.verdict}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove menu item ${m.name}`}
                    onClick={() =>
                      setMenu((old) => old.filter((x) => x.id !== m.id))
                    }
                  >
                    ✕
                  </button>
                </div>
              ))}
              <input
                aria-label="Menu item name"
                placeholder="e.g. Iced matcha"
                value={menuName}
                onChange={(e) => setMenuName(e.target.value)}
              />
              <div className="flex gap-2">
                <select
                  aria-label="Menu verdict"
                  value={verdict}
                  onChange={(e) => setVerdict(e.target.value as typeof verdict)}
                >
                  <option value="must-order">Must order</option>
                  <option value="skip">Skip</option>
                </select>
                <input
                  aria-label="Menu item price"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Price ₱"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
                <button
                  type="button"
                  aria-label="Add menu memory"
                  onClick={() => {
                    if (menuName.trim()) {
                      setMenu((old) => [
                        ...old,
                        {
                          id: crypto.randomUUID(),
                          name: menuName.trim(),
                          verdict,
                          ...(price ? { price: Number(price) } : {}),
                        },
                      ]);
                      setMenuName("");
                      setPrice("");
                    }
                  }}
                >
                  Add
                </button>
              </div>
            </fieldset>
            {action === "visit" && (
              <>
                <label>
                  Visited at
                  <input
                    type="datetime-local"
                    required
                    aria-label="Visit date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <label>
                  Rating (1–5)
                  <input
                    aria-label="Visit rating"
                    type="number"
                    min="1"
                    max="5"
                    step="0.5"
                    required
                    value={rating}
                    onChange={(e) => setRating(Number(e.target.value))}
                  />
                </label>
                <label>
                  Items ordered
                  <input
                    aria-label="Items ordered"
                    placeholder="Separate items with commas"
                    value={items}
                    onChange={(e) => setItems(e.target.value)}
                  />
                </label>
                <label>
                  Total spend (₱)
                  <input
                    aria-label="Total spend"
                    type="number"
                    min="0"
                    step="0.01"
                    value={spend}
                    onChange={(e) => setSpend(e.target.value)}
                  />
                </label>
                <label>
                  Visit notes
                  <textarea
                    aria-label="Visit notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
                <label>
                  Photos
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
                        for (const f of files.slice(0, 8))
                          compressed.push(await compressVisitPhoto(f));
                        if (mounted.current)
                          setPhotos((old) =>
                            [...old, ...compressed].slice(0, 8),
                          );
                      } catch {
                        if (mounted.current)
                          setMessage(
                            "Could not process that photo. Try JPEG, PNG or WebP.",
                          );
                      } finally {
                        if (mounted.current) setProcessing(false);
                      }
                    }}
                  />
                </label>
                <p className="text-xs">
                  {processing
                    ? "Preparing photos…"
                    : `${photos.length} photos ready · saved on your device first`}
                </p>
                {photos.length > 0 && (
                  <button
                    type="button"
                    aria-label="Clear attached photos"
                    onClick={() => setPhotos([])}
                  >
                    Clear photos
                  </button>
                )}
              </>
            )}
            {duplicate && (
              <div role="alert" className="rounded-xl border p-3">
                <p>
                  You already saved {duplicate.name} — log a new visit instead?
                </p>
                <button
                  type="button"
                  aria-label="Log visit at existing venue"
                  onClick={() => {
                    setAction("visit");
                    if (action === "visit") void save(duplicate.id);
                  }}
                >
                  {" "}
                  {action === "visit"
                    ? "Save visit to existing venue"
                    : "Enter visit details"}
                </button>
                <button
                  type="button"
                  aria-label="Cancel duplicate"
                  onClick={() => {
                    setDuplicate(null);
                    setAction(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <button
                className="journal-primary"
                aria-label="Save journal entry"
                disabled={saving || processing}
              >
                {saving ? "Saving…" : "Save on this device"}
              </button>
              <button
                type="button"
                aria-label="Cancel venue form"
                onClick={() => setAction(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {!!visits.length && (
          <div className="mt-4">
            <h3 className="font-semibold">Visit history · {visits.length}</h3>
            <ol className="mt-2 space-y-4">
              {visits.map((v) => (
                <li key={v.id} className="border-l-2 border-accent pl-3">
                  <p className="font-semibold">
                    {new Date(v.visitedAt).toLocaleDateString()} · ★ {v.rating}
                    /5 {v.totalSpend !== undefined ? ` · ₱${v.totalSpend}` : ""}
                  </p>
                  <p className="text-sm">{v.itemsOrdered.join(", ")}</p>
                  <p className="whitespace-pre-wrap text-sm">{v.notes}</p>
                  <div className="mt-2 flex gap-2 overflow-x-auto">
                    {v.localPhotoIds.map((id, i) => (
                      <JournalPhoto
                        key={id}
                        id={id}
                        url={v.photoUrls[i]}
                        alt={`Visit photo ${i + 1}`}
                      />
                    ))}
                    {!v.localPhotoIds.length &&
                      v.photoUrls.map((url, i) => (
                        <JournalPhoto
                          key={url}
                          url={url}
                          alt={`Visit photo ${i + 1}`}
                        />
                      ))}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
        <p role="status" className="mt-2 text-sm">
          {message}
        </p>
      </div>
    </section>
  );
}
