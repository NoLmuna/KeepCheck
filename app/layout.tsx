import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "KeepCheck",
  description:
    "Log and rate your experiences at food and beverage businesses.",
  icons: {
    icon: "/KeepCheck-Logo.png",
    apple: "/KeepCheck-Logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        {/* Google Fonts Link */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&family=Work+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

        {/* Theme persistence helper to avoid flash of light/dark mode */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  try {
    var stored = localStorage.getItem("keepcheck-theme");
    var isDark = stored ? stored === "dark" : true;
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  } catch (e) {}
})();`,
          }}
        />
        {/*
         * ---------- PWA Hydration Fail-Safe ----------
         *
         * On some mobile devices (especially iOS cold starts and certain
         * Android WebViews), the service worker and the Next.js hydration
         * bundle can race, producing a permanent blank white screen.
         *
         * This inline script runs synchronously before any framework JS:
         *   1. Detects if we're in standalone/installed PWA mode.
         *   2. Starts a 3-second watchdog timer.
         *   3. If the window 'load' event (which signals all critical
         *      resources have loaded) hasn't fired within the timeout,
         *      forces a hard reload to break out of the freeze.
         *   4. Clears the timer immediately if 'load' fires in time.
         *
         * The script is intentionally kept minimal and has zero
         * dependencies so it can execute even if all other JS fails.
         */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  // Universal standalone detection:
  // - iOS Safari: window.navigator.standalone (boolean)
  // - Android / Desktop PWA: CSS media query (display-mode: standalone)
  var isStandalone =
    window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;

  if (!isStandalone) return;

  // Hydration watchdog — 3 000 ms grace period.
  var TIMEOUT_MS = 3000;
  var timer = setTimeout(function () {
    // Framework never finished loading → force a hard reload.
    // 'true' bypasses the browser cache (important when the SW itself is stale).
    console.warn("[PWA Watchdog] Hydration timed out — forcing reload.");
    window.location.reload();
  }, TIMEOUT_MS);

  // If the load event fires, everything is fine — cancel the watchdog.
  window.addEventListener("load", function () {
    clearTimeout(timer);
  });
})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
