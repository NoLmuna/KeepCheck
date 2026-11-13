"use client";
import { useEffect, useState } from "react";
import { syncJournal, subscribeJournal } from "./journalSync";
export function useJournalSync(uid: string | undefined, revision: string) {
  const [error, setError] = useState("");
  useEffect(() => {
    if (!uid) return;
    const controller = new AbortController();
    let unsubscribe: (() => void) | undefined;
    const report = (message: string) => {
      if (!controller.signal.aborted) setError(message);
    };
    void subscribeJournal(uid, controller.signal, report)
      .then((fn) => {
        if (controller.signal.aborted) fn();
        else unsubscribe = fn;
      })
      .catch((e) => report(String(e)));
    const sync = () => {
      void syncJournal(uid, controller.signal)
        .then(() => {
          if (!controller.signal.aborted) setError("");
        })
        .catch((e) =>
          report(e instanceof Error ? e.message : "Sync unavailable"),
        );
    };
    window.addEventListener("online", sync);
    const interval = setInterval(sync, 30000);
    sync();
    return () => {
      controller.abort();
      unsubscribe?.();
      clearInterval(interval);
      window.removeEventListener("online", sync);
    };
  }, [uid]);
  useEffect(() => {
    if (!uid) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void syncJournal(uid, controller.signal).catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Sync unavailable");
      });
    }, 800);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [uid, revision]);
  return error;
}
