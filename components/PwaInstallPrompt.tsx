"use client";

import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from "react";
import { Download, X, Share, PlusSquare, Smartphone, CheckCircle2 } from "lucide-react";
import { useToast } from "@/lib/toast";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface PwaInstallContextType {
  canInstall: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  promptInstall: () => Promise<void>;
}

const PwaInstallContext = createContext<PwaInstallContextType>({
  canInstall: false,
  isInstalled: false,
  isIOS: false,
  promptInstall: async () => {},
});

export function usePwaInstall() {
  return useContext(PwaInstallContext);
}

const DISMISSED_KEY = "keepcheck-install-dismissed";

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Detect standalone PWA mode
    const checkInstalled = () => {
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsInstalled(isStandalone);
    };

    checkInstalled();

    // Check iOS Safari
    const ua = window.navigator.userAgent;
    const isIosDevice = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
    setIsIOS(isIosDevice);

    // Check dismissed banner
    try {
      const dismissed = localStorage.getItem(DISMISSED_KEY) === "true";
      setBannerDismissed(dismissed);
    } catch {
      setBannerDismissed(false);
    }

    // Capture Chrome/Android/Desktop install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setBannerDismissed(true);
      try {
        localStorage.setItem(DISMISSED_KEY, "true");
      } catch {}
      showToast("KeepCheck installed successfully!", "success");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [showToast]);

  const promptInstall = useCallback(async () => {
    if (isInstalled) {
      showToast("KeepCheck is already installed on your device", "info");
      return;
    }

    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setIsInstalled(true);
          setDeferredPrompt(null);
          setBannerDismissed(true);
          try {
            localStorage.setItem(DISMISSED_KEY, "true");
          } catch {}
        }
      } catch {
        // Fallback
      }
      return;
    }

    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    // Generic browser fallback
    showToast("To install, tap your browser's menu (⋮ or Share) and select 'Add to Home screen'", "info");
  }, [deferredPrompt, isIOS, isInstalled, showToast]);

  const dismissBanner = () => {
    setBannerDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "true");
    } catch {}
  };

  const canInstall = !isInstalled && (!!deferredPrompt || isIOS);

  return (
    <PwaInstallContext.Provider
      value={{
        canInstall,
        isInstalled,
        isIOS,
        promptInstall,
      }}
    >
      {children}

      {/* Subtle, Non-Intrusive Dismissible Bottom Install Banner */}
      {!isInstalled && !bannerDismissed && (deferredPrompt || isIOS) && (
        <aside
          role="status"
          aria-label="Install KeepCheck"
          className="fixed bottom-16 sm:bottom-4 left-3 right-3 sm:left-auto sm:right-4 z-40 sm:max-w-sm bg-white/95 dark:bg-[#1E1815]/95 backdrop-blur-md border border-stone-200/90 dark:border-stone-800 rounded-2xl p-3 shadow-xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 flex items-center justify-center shrink-0 shadow-2xs">
              <Smartphone className="w-4 h-4 text-amber-700 dark:text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">
                Install KeepCheck
              </p>
              <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                Full-screen offline maps & instant logging
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={promptInstall}
              className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-lg shadow-2xs cursor-pointer transition-colors"
            >
              Install
            </button>
            <button
              type="button"
              onClick={dismissBanner}
              aria-label="Dismiss install prompt"
              className="p-1.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 rounded-lg cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </aside>
      )}

      {/* iOS Safari Step-by-Step Instructions Modal */}
      {showIOSModal && (
        <div
          className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs animate-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowIOSModal(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Install KeepCheck on iOS"
            className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl bg-white dark:bg-[#1C1612] border border-stone-200 dark:border-stone-800 p-5 text-stone-900 dark:text-stone-100 shadow-2xl flex flex-col gap-4 animate-modal-enter"
          >
            <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-amber-700 dark:text-amber-400" />
                <h3 className="font-serif font-bold text-base text-stone-900 dark:text-white">
                  Add to Home Screen
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                aria-label="Close"
                className="p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
              Install KeepCheck on your iPhone or iPad for quick offline access and a native app experience:
            </p>

            <ol className="space-y-3 text-xs text-stone-700 dark:text-stone-300">
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-stone-100 dark:bg-stone-800 font-bold flex items-center justify-center text-[11px] shrink-0 text-amber-700 dark:text-amber-400">
                  1
                </span>
                <div className="flex-1">
                  <span>Tap the </span>
                  <span className="inline-flex items-center gap-1 font-bold text-stone-900 dark:text-white bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded border border-stone-200 dark:border-stone-700">
                    <Share className="w-3 h-3 text-blue-500" /> Share
                  </span>
                  <span> button at the bottom of Safari.</span>
                </div>
              </li>

              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-stone-100 dark:bg-stone-800 font-bold flex items-center justify-center text-[11px] shrink-0 text-amber-700 dark:text-amber-400">
                  2
                </span>
                <div className="flex-1">
                  <span>Scroll down and tap </span>
                  <span className="inline-flex items-center gap-1 font-bold text-stone-900 dark:text-white bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded border border-stone-200 dark:border-stone-700">
                    <PlusSquare className="w-3 h-3 text-stone-600 dark:text-stone-300" /> Add to Home Screen
                  </span>
                  <span>.</span>
                </div>
              </li>

              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-stone-100 dark:bg-stone-800 font-bold flex items-center justify-center text-[11px] shrink-0 text-amber-700 dark:text-amber-400">
                  3
                </span>
                <div className="flex-1">
                  <span>Tap </span>
                  <span className="font-bold text-stone-900 dark:text-white">Add</span>
                  <span> in the top-right corner to finish.</span>
                </div>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-xs font-bold rounded-xl transition-colors cursor-pointer mt-1"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </PwaInstallContext.Provider>
  );
}
