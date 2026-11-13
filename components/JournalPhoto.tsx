"use client";
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/app/db";
export default function JournalPhoto({
  id,
  url,
  alt,
}: {
  id?: string;
  url?: string;
  alt: string;
}) {
  const photo = useLiveQuery(
    () => (id ? db.photoQueue.get(id) : undefined),
    [id],
  );
  const [source, setSource] = useState<string>();
  useEffect(() => {
    const blob = photo?.blob ?? photo?.thumbnail;
    if (!blob) return;
    const objectUrl = URL.createObjectURL(blob);
    // Blob URLs are browser resources created and released with this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSource(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo?.blob, photo?.thumbnail]);
  const src = source ?? photo?.remoteUrl ?? url;
  // Local Blob URLs provide offline previews without a remote image proxy.
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="h-28 w-36 shrink-0 rounded-xl object-cover"
    />
  ) : (
    <span className="text-xs">Photo unavailable on this device</span>
  );
}
