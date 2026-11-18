"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  Send,
  Bug,
  Sparkles,
  MessageSquare,
  AlertCircle,
  WifiOff,
  Loader2,
} from "lucide-react";
import { useToast } from "@/lib/toast";

export type FeedbackCategory = "bug" | "idea" | "general";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCategory?: FeedbackCategory;
}

const DRAFT_KEY = "keepcheck-feedback-draft";
const LAST_SENT_KEY = "keepcheck-feedback-last-sent";
const COOLDOWN_MS = 60000;

function getRemainingCooldown(): number {
  if (typeof window === "undefined") return 0;
  try {
    const lastSentStr = localStorage.getItem(LAST_SENT_KEY);
    if (!lastSentStr) return 0;
    const elapsed = Date.now() - Number(lastSentStr);
    return elapsed < COOLDOWN_MS ? Math.ceil((COOLDOWN_MS - elapsed) / 1000) : 0;
  } catch {
    return 0;
  }
}

function getStoredDraft(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function FeedbackModal({
  isOpen,
  onClose,
  defaultCategory = "general",
}: FeedbackModalProps) {
  const { showToast } = useToast();
  const dialogRef = useRef<HTMLElement>(null);
  const openedAtRef = useRef<number>(0);

  const [category, setCategory] = useState<FeedbackCategory>(defaultCategory);
  const [message, setMessage] = useState<string>(getStoredDraft);
  const [honeypot, setHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);

  // Capture openedAt timestamp on mount / open
  useEffect(() => {
    if (isOpen) {
      openedAtRef.current = Date.now();
    }
  }, [isOpen]);

  // Monitor network status
  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Monitor cooldown status (60-second limit)
  useEffect(() => {
    if (!isOpen) return;

    const update = () => setCooldownRemaining(getRemainingCooldown());
    const timeout = setTimeout(update, 0);
    const interval = setInterval(update, 1000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [isOpen]);

  // Handle Escape key closure
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) {
        e.stopPropagation();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, submitting, onClose]);

  // Save draft to localStorage on change
  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setMessage(val);
    try {
      localStorage.setItem(DRAFT_KEY, val);
    } catch {
      // LocalStorage access may fail in restricted sandboxes
    }
  };

  const isSubmitDisabled =
    submitting || !isOnline || cooldownRemaining > 0 || message.trim().length < 5;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitDisabled) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = {
        category,
        message,
        metadata: {
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          route: window.location.pathname,
          userAgent: navigator.userAgent,
        },
        website: honeypot,
        openedAt: openedAtRef.current,
      };

      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (!res.ok) {
        const errorMsg =
          typeof data.error === "string"
            ? data.error
            : "Failed to submit feedback. Please try again.";
        setErrorMessage(errorMsg);
        showToast(errorMsg, "error");
        return;
      }

      // Success: clear draft & set cooldown
      try {
        localStorage.removeItem(DRAFT_KEY);
        localStorage.setItem(LAST_SENT_KEY, Date.now().toString());
      } catch {
        // Ignore localStorage error
      }

      setMessage("");
      showToast("Feedback sent! Thank you for helping improve KeepCheck.", "success");
      onClose();
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Network error. Please try again.";
      setErrorMessage(errorMsg);
      showToast(errorMsg, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[950] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs animate-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
        className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-white dark:bg-[#1C1612] border border-stone-200 dark:border-stone-800 p-5 sm:p-6 text-stone-900 dark:text-stone-100 shadow-2xl flex flex-col gap-4 animate-modal-enter"
      >
        {/* Header */}
        <div className="flex justify-between items-start pb-3 border-b border-stone-100 dark:border-stone-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 flex items-center justify-center shrink-0">
              <MessageSquare className="w-5 h-5 text-amber-700 dark:text-amber-400" />
            </div>
            <div>
              <h2
                id="feedback-modal-title"
                className="text-lg sm:text-xl font-serif font-bold text-stone-900 dark:text-white"
              >
                Send Feedback
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Help us improve KeepCheck by reporting bugs or sharing your ideas
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-label="Close modal"
            onClick={onClose}
            disabled={submitting}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Honeypot field (hidden from assistive technologies & visually hidden) */}
          <div aria-hidden="true" className="sr-only opacity-0 absolute -z-10 pointer-events-none">
            <label htmlFor="feedback-website-honeypot">Website</label>
            <input
              id="feedback-website-honeypot"
              type="text"
              name="website"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          {/* Category selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">
              Category
            </label>
            <div
              role="radiogroup"
              aria-label="Feedback category"
              className="grid grid-cols-3 gap-2"
            >
              <button
                type="button"
                role="radio"
                aria-checked={category === "bug"}
                onClick={() => setCategory("bug")}
                className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                  category === "bug"
                    ? "bg-red-50 dark:bg-red-950/60 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 shadow-2xs"
                    : "bg-stone-50 dark:bg-stone-800/40 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
                }`}
              >
                <Bug className="w-4 h-4 shrink-0" />
                <span>Bug Report</span>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={category === "idea"}
                onClick={() => setCategory("idea")}
                className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                  category === "idea"
                    ? "bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 shadow-2xs"
                    : "bg-stone-50 dark:bg-stone-800/40 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
                }`}
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>Feature Idea</span>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={category === "general"}
                onClick={() => setCategory("general")}
                className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                  category === "general"
                    ? "bg-stone-200/80 dark:bg-stone-700 border-stone-400 dark:border-stone-600 text-stone-900 dark:text-white shadow-2xs"
                    : "bg-stone-50 dark:bg-stone-800/40 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
                }`}
              >
                <MessageSquare className="w-4 h-4 shrink-0" />
                <span>General</span>
              </button>
            </div>
          </div>

          {/* Message textarea with live character counter */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label
                htmlFor="feedback-message"
                className="text-xs font-semibold text-stone-700 dark:text-stone-300"
              >
                Message
              </label>
              <span
                className={`text-[11px] tabular-nums ${
                  message.length > 950
                    ? "text-red-600 dark:text-red-400 font-bold"
                    : "text-stone-500 dark:text-stone-400"
                }`}
              >
                {message.length} / 1000
              </span>
            </div>

            <textarea
              id="feedback-message"
              rows={4}
              maxLength={1000}
              value={message}
              onChange={handleMessageChange}
              placeholder={
                category === "bug"
                  ? "Describe what went wrong and how to reproduce it..."
                  : category === "idea"
                    ? "Describe your feature idea and how it would improve KeepCheck..."
                    : "Share your thoughts, suggestions, or feedback..."
              }
              disabled={submitting}
              className="w-full p-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-stone-900 dark:text-white placeholder:text-stone-400 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all resize-y disabled:opacity-50"
            />
            <p className="text-[11px] text-stone-500 dark:text-stone-400">
              Minimum 5 characters. Draft is automatically saved on this device.
            </p>
          </div>

          {/* Offline warning */}
          {!isOnline && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2"
            >
              <WifiOff className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>You are currently offline. Feedback submission requires an internet connection.</span>
            </div>
          )}

          {/* Cooldown notice */}
          {cooldownRemaining > 0 && (
            <div
              role="status"
              className="p-3 rounded-xl bg-stone-100 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 text-xs flex items-center gap-2"
            >
              <span>Please wait {cooldownRemaining}s before sending another feedback.</span>
            </div>
          )}

          {/* Submission error message */}
          {errorMessage && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-300 text-xs flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Modal Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-stone-100 dark:border-stone-800">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="min-h-[44px] px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitDisabled}
              className="min-h-[44px] px-5 py-2 text-xs font-bold text-white bg-amber-700 hover:bg-amber-800 active:bg-amber-900 disabled:bg-stone-300 dark:disabled:bg-stone-800 disabled:text-stone-500 dark:disabled:text-stone-500 disabled:cursor-not-allowed rounded-xl flex items-center gap-2 shadow-xs transition-all cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Sending…</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Feedback</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
