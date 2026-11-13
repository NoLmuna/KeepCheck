"use client";
import { useRef, useState } from "react";
import { db } from "@/app/db";
import type { Spot, VisitLog, SpotCollection } from "@/lib/models";
import { makeBackup, restoreBackup, backupCsv } from "@/lib/journalBackup";
import { downloadBlob, shareCard } from "@/lib/journalMedia";
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
  const [tab, setTab] = useState("insights"),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [editing, setEditing] = useState<SpotCollection>(),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [importData, setImportData] = useState<unknown>();
  const file = useRef<HTMLInputElement>(null);
  const stats = journalInsights(spots, visits);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Unable to complete this action",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="absolute inset-0 z-[900] flex items-end justify-center bg-black/40 sm:items-center"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Journal tools"
        className="journal-sheet max-h-[90dvh] w-full max-w-xl overflow-auto rounded-t-3xl bg-bg p-5 sm:rounded-3xl"
      >
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-serif">Your KeepCheck</h2>
          <button aria-label="Close journal tools" onClick={onClose}>
            ✕
          </button>
        </div>
        <nav className="my-3 flex gap-2">
          {["insights", "collections", "data"].map((t) => (
            <button
              aria-label={`Show ${t}`}
              aria-pressed={tab === t}
              key={t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>
        {tab === "insights" && (
          <>
            <h3 className="font-semibold">Food & Café Insights</h3>
            <dl className="my-4 grid grid-cols-2 gap-3">
              {[
                ["Visited venues", stats.visited],
                ["Wishlist", stats.wishlist],
                ["Logged visits", stats.visits],
                ["Favorite category", stats.favorite],
                [
                  "Average spend per visit",
                  stats.averageSpend === null
                    ? "No spend logged"
                    : `₱${stats.averageSpend.toFixed(2)}`,
                ],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border p-3">
                  <dt className="text-xs">{label}</dt>
                  <dd className="text-xl font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
            <h4>Top localities</h4>
            {stats.localities.length ? (
              stats.localities.map(([name, count]) => (
                <p key={name}>
                  {name} · {count}
                </p>
              ))
            ) : (
              <p>No locality data yet.</p>
            )}
            <p className="mt-3 text-xs">
              Computed on this device. Average spend excludes visits without a
              spend amount.
            </p>
          </>
        )}
        {tab === "collections" && (
          <>
            <form
              className="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await saveCollection(name, description, uid, editing);
                  setName("");
                  setDescription("");
                  setEditing(undefined);
                  setMessage("Collection saved");
                });
              }}
            >
              <label>
                Collection name
                <input
                  required
                  aria-label="Collection name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Description
                <textarea
                  aria-label="Collection description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <button disabled={busy} aria-label="Save collection">
                {editing ? "Update collection" : "Create collection"}
              </button>
            </form>
            <div className="mt-4 space-y-3">
              {collections.map((c) => (
                <article key={c.id} className="rounded-xl border p-3">
                  <h3 className="font-semibold">{c.name}</h3>
                  <p className="text-sm">{c.description}</p>
                  <p className="text-xs">
                    {spots.filter((s) => s.collectionIds.includes(c.id)).length}{" "}
                    venues · assign venues from Edit venue
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <button
                      aria-label={`Edit collection ${c.name}`}
                      onClick={() => {
                        setEditing(c);
                        setName(c.name);
                        setDescription(c.description ?? "");
                      }}
                    >
                      Edit
                    </button>
                    <button
                      aria-label={`Share collection ${c.name}`}
                      onClick={() => {
                        void run(() =>
                          shareCard(c.name, [
                            c.description ?? "",
                            ...spots
                              .filter((s) => s.collectionIds.includes(c.id))
                              .map(
                                (s) =>
                                  `${s.name} · ${s.overallRating ? `★ ${s.overallRating.toFixed(1)}` : "Wishlist"} · ${s.location.locality ?? s.location.formattedAddress}`,
                              ),
                          ]),
                        );
                      }}
                    >
                      Share Card
                    </button>
                    <button
                      aria-label={`Delete collection ${c.name}`}
                      onClick={() => {
                        void run(async () => {
                          await deleteCollection(c.id);
                          setMessage("Collection deleted; venues retained");
                        });
                      }}
                    >
                      Delete collection
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
        {tab === "data" && (
          <div className="grid gap-3">
            <p className="text-sm">
              Export your venues, visits, collections and local photos. Restore
              merges newer records by ID without replacing newer local edits.
            </p>
            <button
              disabled={busy}
              aria-label="Export JSON backup"
              onClick={() => {
                void run(async () => {
                  downloadBlob(
                    new Blob([JSON.stringify(await makeBackup(uid))], {
                      type: "application/json",
                    }),
                    "keepcheck-backup.json",
                  );
                  setMessage("JSON backup downloaded");
                });
              }}
            >
              Full JSON backup
            </button>
            <button
              disabled={busy}
              aria-label="Export CSV"
              onClick={() => {
                void run(async () => {
                  downloadBlob(
                    new Blob([backupCsv(await makeBackup(uid))], {
                      type: "text/csv;charset=utf-8",
                    }),
                    "keepcheck-journal.csv",
                  );
                  setMessage("CSV downloaded");
                });
              }}
            >
              Export CSV
            </button>
            <label>
              Restore JSON
              <input
                ref={file}
                aria-label="Import JSON backup"
                type="file"
                accept="application/json,.json"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void run(async () => {
                    if (f.size > 100 * 1024 * 1024)
                      throw new Error("Backup exceeds the 100 MB import limit");
                    setImportData(JSON.parse(await f.text()) as unknown);
                    setMessage(
                      "Backup loaded. Confirm to merge into this journal.",
                    );
                  });
                }}
              />
            </label>
            {importData !== undefined && (
              <button
                disabled={busy}
                aria-label="Confirm restore backup"
                onClick={() => {
                  void run(async () => {
                    const count = await restoreBackup(importData, uid);
                    setImportData(undefined);
                    if (file.current) file.current.value = "";
                    setMessage(`Restored ${count} records`);
                  });
                }}
              >
                Confirm merge backup
              </button>
            )}
            {uid && (
              <button
                disabled={busy}
                aria-label="Sync guest journal to this account"
                onClick={() => {
                  void run(async () => {
                    await db.transaction(
                      "rw",
                      db.venues,
                      db.visitLogs,
                      db.collections,
                      db.photoQueue,
                      async () => {
                        const now = Date.now();
                        for (const name of [
                          "venues",
                          "visitLogs",
                          "collections",
                        ])
                          await db
                            .table<import("@/lib/models").SyncRecord, string>(
                              name,
                            )
                            .filter((r) => !r.userId)
                            .modify({
                              userId: uid,
                              updatedAt: now,
                              syncStatus: "pending",
                            });
                        await db.photoQueue
                          .filter((p) => !p.userId)
                          .modify({ userId: uid });
                      },
                    );
                    setMessage("Guest records queued for this account");
                  });
                }}
              >
                Sync guest journal to this account
              </button>
            )}
            <p className="text-xs">
              Uploaded originals are linked by URL in backups; local previews
              and pending originals are embedded. Keep your backups somewhere
              safe.
            </p>
          </div>
        )}
        <p role="status" className="mt-3 text-sm">
          {busy ? "Working on this device…" : message}
        </p>
      </section>
    </div>
  );
}
