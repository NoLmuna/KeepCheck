"use client";

import { memo, useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/app/db";

const JournalPhoto = memo(function JournalPhoto({
  id,
  url,
  alt,
  className = "h-full w-full object-cover",
}: {
  id?: string;
  url?: string;
  alt: string;
  className?: string;
}) {
  const photo = useLiveQuery(
    () => (id ? db.photoQueue.get(id) : undefined),
    [id],
  );
  const [source, setSource] = useState<{ blob: Blob; url: string }>();
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [id, url, photo?.remoteUrl]);

  useEffect(() => {
    const blob = photo?.blob ?? photo?.thumbnail;
    if (!blob) return;
    const objectUrl = URL.createObjectURL(blob);
    // Blob URLs are browser resources created and released with this effect.
    setSource({ blob, url: objectUrl });
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo?.blob, photo?.thumbnail]);

  // Priority order:
  // 1. Local IndexedDB Blob (URL.createObjectURL) if the photo exists locally on this device/origin
  // 2. Synced remote URL (photo.remoteUrl / url) starting with https:// whenever a local Blob is absent
  const localBlobUrl =
    source?.blob === (photo?.blob ?? photo?.thumbnail)
      ? source?.url
      : undefined;

  const remoteUrl =
    (photo?.remoteUrl && photo.remoteUrl.startsWith("https://")
      ? photo.remoteUrl
      : undefined) ??
    (url && url.startsWith("https://") ? url : (photo?.remoteUrl || url));

  const src = (!imgError && (localBlobUrl || remoteUrl)) || undefined;

  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      loading="lazy"
      decoding="async"
      src={src}
      alt={alt}
      className={className}
      onError={() => setImgError(true)}
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center p-1 text-center bg-stone-100 dark:bg-stone-800 text-[10px] leading-tight text-stone-400 dark:text-stone-500">
      <span>Photo unavailable on this device</span>
    </div>
  );
});

export default JournalPhoto;
