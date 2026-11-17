"use client";

import { useRef, useState, useEffect } from "react";
import {
  X,
  BarChart3,
  Folder,
  Share2,
  Edit3,
  Trash2,
} from "lucide-react";
import type { Spot, VisitLog, SpotCollection } from "@/lib/models";
import { shareCard } from "@/lib/journalMedia";
import {
  saveCollection,
  deleteCollection,
  journalInsights,
} from "@/lib/journal";

export default function JournalTools({
  uid,
  spots,
  visits,
  collections,
  onClose,
}: {
  uid?: string;
  spots: Spot[];
  visits: VisitLog[];
  collections: SpotCollection[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"insights" | "collections">("insights");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<SpotCollection>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const dialog = useRef<HTMLElement>(null);

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

  const stats = journalInsights(spots, visits);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Unable to complete this action"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[900] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs animate-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="My Lists & Stats"
        className="w-full max-w-xl max-h-[90dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-white dark:bg-[#1C1612] border border-stone-200 dark:border-stone-800 p-5 sm:p-6 text-stone-900 dark:text-stone-100 shadow-2xl flex flex-col gap-4 animate-modal-enter"
      >
        {/* Header */}
        <div className="flex justify-between items-center pb-2 border-b border-stone-100 dark:border-stone-800">
          <div>
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-stone-900 dark:text-white">
              My Lists & Stats
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Personal insights, rankings & custom spot collections
            </p>
          </div>
          <button
            aria-label="Close modal"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation (2 clean tabs) */}
        <nav className="flex gap-1.5 p-1 bg-stone-100 dark:bg-stone-800/80 rounded-xl">
          {[
            { id: "insights", label: "Insights", icon: BarChart3 },
            { id: "collections", label: "Collections", icon: Folder },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-label={`Show ${label}`}
              aria-pressed={tab === id}
              onClick={() => setTab(id as typeof tab)}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                tab === id
                  ? "bg-white dark:bg-[#251D18] text-stone-900 dark:text-stone-100 shadow-xs"
                  : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200"
              }`}
            >
              <Icon className="w-4 h-4 text-amber-700 dark:text-amber-500" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* Tab 1: Insights */}
        {tab === "insights" && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              Food & Café Statistics
            </h3>

            {/* High-Contrast Stat Cards (Dark Mode Fix) */}
            <dl className="grid grid-cols-2 gap-2.5">
              {[
                ["Visited Venues", stats.visited],
                ["Wishlist Spots", stats.wishlist],
                ["Logged Visits", stats.visits],
                ["Top Category", stats.favorite],
                [
                  "Avg. Spend / Visit",
                  stats.averageSpend === null
                    ? "No spend logged"
                    : `₱${stats.averageSpend.toFixed(2)}`,
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-stone-200/90 dark:border-stone-700 bg-stone-50 dark:bg-[#251D18] p-3.5 shadow-2xs"
                >
                  <dt className="text-[11px] font-semibold text-stone-600 dark:text-stone-300">
                    {label}
                  </dt>
                  <dd className="text-xl font-serif font-bold text-stone-900 dark:text-white capitalize mt-1 tabular-nums">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="space-y-2 pt-2 border-t border-stone-100 dark:border-stone-800">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300">
                Top Neighborhoods & Cities
              </h4>
              {stats.localities.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {stats.localities.map(([localName, count]) => (
                    <span
                      key={localName}
                      className="px-2.5 py-1 rounded-lg text-xs bg-stone-100 dark:bg-[#251D18] text-stone-700 dark:text-stone-200 border border-stone-200 dark:border-stone-700"
                    >
                      {localName} <strong className="text-amber-700 dark:text-amber-400 tabular-nums">· {count}</strong>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-stone-500 dark:text-stone-400">No locality data yet.</p>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Collections */}
        {tab === "collections" && (
          <div className="space-y-4">
            <form
              className="space-y-2.5 p-4 rounded-xl bg-stone-50 dark:bg-[#251D18] border border-stone-200 dark:border-stone-700"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await saveCollection(name, description, uid, editing);
                  setName("");
                  setDescription("");
                  setEditing(undefined);
                  setMessage("Collection saved successfully!");
                });
              }}
            >
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                {editing ? "Edit Collection" : "Create New Collection"}
              </h4>
              <div>
                <input
                  required
                  aria-label="Collection name"
                  placeholder="e.g. Best Matchas in Town, Date Night Spots…"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-[#1C1612] text-xs text-stone-900 dark:text-white outline-none focus:border-amber-600"
                />
              </div>
              <div>
                <textarea
                  rows={2}
                  aria-label="Collection description"
                  placeholder="Optional notes about this collection…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-[#1C1612] text-xs text-stone-900 dark:text-white outline-none focus:border-amber-600 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {editing ? "Update Collection" : "+ Create Collection"}
                </button>
                {editing && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(undefined);
                      setName("");
                      setDescription("");
                    }}
                    className="px-3 py-2 text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700 rounded-xl"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>

            {/* List of existing collections */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300">
                Your Collections ({collections.length})
              </h4>
              {collections.map((c) => (
                <article
                  key={c.id}
                  className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#251D18] p-3.5 space-y-2 shadow-2xs"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h5 className="font-bold text-sm text-stone-900 dark:text-white">
                        {c.name}
                      </h5>
                      {c.description && (
                        <p className="text-xs text-stone-500 dark:text-stone-300">{c.description}</p>
                      )}
                    </div>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 tabular-nums">
                      {spots.filter((s) => s.collectionIds?.includes(c.id)).length} spots
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1 border-t border-stone-100 dark:border-stone-800">
                    <button
                      type="button"
                      aria-label={`Edit collection ${c.name}`}
                      onClick={() => {
                        setEditing(c);
                        setName(c.name);
                        setDescription(c.description ?? "");
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-700 dark:text-stone-200 hover:text-stone-900 dark:hover:text-white px-2 py-1 rounded-md bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Share collection ${c.name}`}
                      onClick={() => {
                        void run(() =>
                          shareCard(c.name, [
                            c.description ?? "",
                            ...spots
                              .filter((s) => s.collectionIds?.includes(c.id))
                              .map(
                                (s) =>
                                  `${s.name} · ${s.overallRating ? `★ ${s.overallRating.toFixed(1)}` : "Wishlist"} · ${s.location.locality ?? s.location.formattedAddress}`,
                              ),
                          ]),
                        );
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-700 dark:text-stone-200 hover:text-stone-900 dark:hover:text-white px-2 py-1 rounded-md bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors cursor-pointer"
                    >
                      <Share2 className="w-3 h-3 text-amber-700 dark:text-amber-500" />
                      <span>Share Card</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete collection ${c.name}`}
                      onClick={() => {
                        void run(async () => {
                          await deleteCollection(c.id);
                          setMessage("Collection deleted; venues retained");
                        });
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400 hover:text-red-700 px-2 py-1 rounded-md bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Delete</span>
                    </button>
                  </div>
                </article>
              ))}
              {collections.length === 0 && (
                <p className="text-xs text-stone-500 dark:text-stone-400 p-4 text-center bg-stone-50 dark:bg-[#251D18] rounded-xl border border-stone-200 dark:border-stone-800">
                  No collections yet. Group your saved spots into custom lists above!
                </p>
              )}
            </div>
          </div>
        )}

        {/* Status Feedback */}
        {message && (
          <div
            role="status"
            className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs font-medium text-amber-900 dark:text-amber-200"
          >
            {busy ? "Working on this device…" : message}
          </div>
        )}
      </section>
    </div>
  );
}
