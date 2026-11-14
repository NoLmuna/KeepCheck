"use client";
import { memo, useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/app/db";
const JournalPhoto = memo(function JournalPhoto({
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
  const [source, setSource] = useState<{ blob: Blob; url: string }>();
  useEffect(() => {
    const blob = photo?.blob ?? photo?.thumbnail;
    if (!blob) return;
    const objectUrl = URL.createObjectURL(blob);
    // Blob URLs are browser resources created and released with this effect.
    setSource({ blob, url: objectUrl });
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo?.blob, photo?.thumbnail]);
  const src =
    (source?.blob === (photo?.blob ?? photo?.thumbnail)
      ? source?.url
      : undefined) ??
    photo?.remoteUrl ??
    url;
  // Local Blob URLs provide offline previews without a remote image proxy.
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      loading="lazy"
      decoding="async"
      src={src}
      alt={alt}
      className="h-28 w-36 shrink-0 rounded-xl object-cover"
    />
  ) : (
    <span className="text-xs">Photo unavailable on this device</span>
  );
});
export default JournalPhoto;
