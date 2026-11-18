"use client";

import { useRef, useState, useEffect } from "react";
import {
  X,
  Database,
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { makeBackup, restoreBackup, backupCsv } from "@/lib/journalBackup";
import { downloadBlob } from "@/lib/journalMedia";

interface Props {
  uid?: string;
  onClose: () => void;
  onOpenFeedback?: (defaultCategory?: "bug" | "idea" | "general") => void;
}

export default function AccountDataModal({ uid, onClose, onOpenFeedback }: Props) {
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importData, setImportData] = useState<unknown>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const backdropPointerDownRef = useRef<EventTarget | null>(null);

  // Lock body scroll when modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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

  async function runAction(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    setIsError(false);
    try {
      await fn();
    } catch (e) {
      setIsError(true);
      setMessage(
        e instanceof Error ? e.message : "Unable to complete this action"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs animate-backdrop"
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
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Account & Data Management"
        className="w-full max-w-lg max-h-[90dvh] rounded-t-3xl sm:rounded-2xl bg-white dark:bg-[#1C1612] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 shadow-2xl flex flex-col overflow-hidden animate-modal-enter"
      >
        {/* Sticky Header */}
        <div className="flex justify-between items-center px-5 sm:px-6 py-4 border-b border-stone-100 dark:border-stone-800 bg-[#FAF7F2] dark:bg-[#15110F] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 flex items-center justify-center shrink-0">
              <Database className="w-5 h-5 text-amber-700 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-serif font-bold text-stone-900 dark:text-white">
                Account & Data
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Backup, export, and restore your journal data
              </p>
            </div>
          </div>

          <button
            aria-label="Close modal"
            onClick={onClose}
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto overscroll-contain flex-1 space-y-4">
          <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
            All your venues, notes, photos, and ratings are stored offline-first on your device. You can download a complete backup at any time or transfer your data across devices.
          </p>

          {/* Export Action Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* JSON Full Backup */}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void runAction(async () => {
                  const data = await makeBackup(uid);
                  downloadBlob(
                    new Blob([JSON.stringify(data, null, 2)], {
                      type: "application/json",
                    }),
                    `keepcheck-backup-${new Date().toISOString().slice(0, 10)}.json`
                  );
                  setMessage("Full JSON backup downloaded successfully!");
                });
              }}
              className="p-3.5 min-h-[44px] bg-stone-50 dark:bg-[#251D18] hover:bg-stone-100 dark:hover:bg-[#2E241E] border border-stone-200 dark:border-stone-700 rounded-xl text-left cursor-pointer transition-all shadow-2xs group"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-stone-900 dark:text-white mb-1">
                <Download className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 group-hover:scale-110 transition-transform" />
                <span>Full JSON Backup</span>
              </div>
              <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-normal">
                Includes all places, visit logs, collections, and full offline photos.
              </p>
            </button>

            {/* CSV Spreadsheet Export */}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void runAction(async () => {
                  const data = await makeBackup(uid);
                  const csv = backupCsv(data);
                  downloadBlob(
                    new Blob([csv], { type: "text/csv;charset=utf-8" }),
                    `keepcheck-journal-${new Date().toISOString().slice(0, 10)}.csv`
                  );
                  setMessage("CSV spreadsheet exported successfully!");
                });
              }}
              className="p-3.5 min-h-[44px] bg-stone-50 dark:bg-[#251D18] hover:bg-stone-100 dark:hover:bg-[#2E241E] border border-stone-200 dark:border-stone-700 rounded-xl text-left cursor-pointer transition-all shadow-2xs group"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-stone-900 dark:text-white mb-1">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 group-hover:scale-110 transition-transform" />
                <span>Export to CSV</span>
              </div>
              <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-normal">
                Easily open in Google Sheets or Excel to view and sort your places.
              </p>
            </button>
          </div>

          {/* Restore / Import Section (Dark Mode Legible Box) */}
          <div className="p-4 bg-stone-50 dark:bg-[#251D18] rounded-xl border border-stone-200 dark:border-stone-700 space-y-3">
            <div>
              <h3 className="text-xs font-bold text-stone-900 dark:text-white">
                Restore or Merge Backup
              </h3>
              <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                Select a previously saved KeepCheck <code className="text-amber-700 dark:text-amber-400 font-mono">.json</code> file to restore.
              </p>
            </div>

            {/* Styled File Input Box */}
            <div className="relative">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void runAction(async () => {
                    if (f.size > 100 * 1024 * 1024) {
                      throw new Error("Backup file exceeds the 100 MB limit");
                    }
                    const text = await f.text();
                    const parsed = JSON.parse(text);
                    setImportData(parsed);
                    setMessage(`Backup file "${f.name}" verified. Tap confirm to restore.`);
                  });
                }}
                className="w-full text-base md:text-xs text-stone-700 dark:text-stone-200 file:mr-3 file:py-2.5 file:px-3.5 file:rounded-lg file:border file:border-stone-300 dark:file:border-stone-600 file:text-xs file:font-semibold file:bg-white dark:file:bg-stone-800 file:text-stone-900 dark:file:text-white hover:file:bg-stone-100 dark:hover:file:bg-stone-700 cursor-pointer"
              />
            </div>

            {importData !== undefined && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void runAction(async () => {
                    const count = await restoreBackup(importData, uid);
                    setImportData(undefined);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                    setMessage(`Successfully restored ${count} spots into your journal!`);
                  });
                }}
                className="w-full min-h-[44px] py-2.5 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Confirm & Restore Places</span>
              </button>
            )}
          </div>

          {/* Feedback Toast / Status Message */}
          {message && (
            <div
              role="status"
              className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                isError
                  ? "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-800 dark:text-red-300"
                  : "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200"
              }`}
            >
              {isError ? (
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              )}
              <span>{busy ? "Processing backup file…" : message}</span>
            </div>
          )}

          {/* Subtle contextual feedback trigger */}
          <div className="pt-2 text-center border-t border-stone-100 dark:border-stone-800">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenFeedback?.("bug");
              }}
              className="text-xs text-stone-500 dark:text-stone-400 hover:text-amber-700 dark:hover:text-amber-400 underline underline-offset-2 transition-colors cursor-pointer py-1"
            >
              Notice a sync issue? Send feedback
            </button>
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="flex items-center justify-end px-5 sm:px-6 py-3.5 border-t border-stone-100 dark:border-stone-800 bg-[#FAF7F2] dark:bg-[#15110F] shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-5 py-2 text-xs font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800 rounded-xl transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </section>
    </div>
  );
}
