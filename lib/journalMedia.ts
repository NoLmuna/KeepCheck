export async function compressVisitPhoto(
  file: Blob,
): Promise<{ blob: Blob; thumbnail: Blob }> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
  } catch {
    bitmap = await createImageBitmap(file);
  }

  try {
    async function render(maxDim: number, quality: number): Promise<Blob> {
      // Downscale safely, capping max dimension to 1600px for mobile WebKit/Chromium stability
      const clampedMax = Math.min(maxDim, 1600);
      const longest = Math.max(bitmap.width, bitmap.height);
      const scale = Math.min(1, clampedMax / longest);
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        canvas.width = 0;
        canvas.height = 0;
        throw new Error("Photo processing unavailable");
      }
      context.drawImage(bitmap, 0, 0, width, height);

      return new Promise<Blob>((resolve, reject) => {
        // Try WebP first; gracefully fallback to JPEG 0.8 quality if WebP encoding is unsupported
        canvas.toBlob(
          (blob) => {
            if (blob) {
              canvas.width = 0;
              canvas.height = 0;
              resolve(blob);
            } else {
              canvas.toBlob(
                (jpegBlob) => {
                  canvas.width = 0;
                  canvas.height = 0;
                  if (jpegBlob) resolve(jpegBlob);
                  else reject(new Error("Could not compress photo"));
                },
                "image/jpeg",
                Math.min(quality, 0.8),
              );
            }
          },
          "image/webp",
          Math.min(quality, 0.8),
        );
      });
    }

    let blob = await render(1600, 0.8);
    if (blob.size > 350 * 1024) blob = await render(1280, 0.75);
    if (blob.size > 350 * 1024) blob = await render(1000, 0.7);
    const thumbnail = await render(320, 0.7);
    return { blob, thumbnail };
  } finally {
    bitmap.close();
  }
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export async function shareCard(title: string, lines: string[]) {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 960;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.width = 0;
    canvas.height = 0;
    throw new Error("Card rendering unavailable");
  }
  ctx.fillStyle = "#faf3e8";
  ctx.fillRect(0, 0, 720, 960);
  ctx.fillStyle = "#6b4930";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText("KEEPCHECK · MY FOOD JOURNAL", 48, 65);
  let y = 135;
  function text(content: string, font: string) {
    ctx!.font = font;
    let line = "";
    for (const word of content.split(/\s+/)) {
      const next = `${line} ${word}`.trim();
      if (ctx!.measureText(next).width > 624 && line) {
        ctx!.fillText(line, 48, y);
        y += 38;
        line = word;
      } else line = next;
    }
    ctx!.fillText(line, 48, y);
    y += 50;
  }
  ctx.fillStyle = "#2f241b";
  text(title, "bold 40px sans-serif");
  for (const line of lines) {
    if (y > 850) break;
    text(line, "26px sans-serif");
  }
  ctx.font = "18px sans-serif";
  ctx.fillText("Saved moments. Good places.", 48, 920);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => {
        canvas.width = 0;
        canvas.height = 0;
        if (b) resolve(b);
        else reject(new Error("Could not create card"));
      },
      "image/png",
    ),
  );
  const file = new File([blob], "keepcheck-card.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title, files: [file] });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
  }
  downloadBlob(blob, "keepcheck-card.png");
}

export interface GalleryPhotoItem {
  key: string;
  id?: string;
  url?: string;
}

/**
 * Resolves all available photos for a venue/spot in priority order:
 * 1. Spot cover photo (localCoverPhotoId and/or coverPhotoUrl)
 * 2. Photos from visits (paired by index: localPhotoId and remote photoUrl)
 * 3. Any additional spot-level photoUrls
 * Deduplicates by local ID and remote URL.
 */
export function resolveSpotGalleryPhotos(
  spot?: {
    localCoverPhotoId?: string;
    coverPhotoUrl?: string;
    photoUrls?: string[];
  } | null,
  visits: Array<{
    id?: string;
    localPhotoIds?: string[];
    photoUrls?: string[];
  }> = [],
): GalleryPhotoItem[] {
  const items: GalleryPhotoItem[] = [];
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();

  // 1. Spot cover photo
  const coverUrl = spot?.coverPhotoUrl || spot?.photoUrls?.[0];
  if (spot?.localCoverPhotoId || coverUrl) {
    if (spot?.localCoverPhotoId) seenIds.add(spot.localCoverPhotoId);
    if (coverUrl) seenUrls.add(coverUrl);
    items.push({
      key: spot?.localCoverPhotoId || coverUrl!,
      id: spot?.localCoverPhotoId,
      url: coverUrl,
    });
  }

  // 2. Photos from visits (pair localPhotoIds and photoUrls by index)
  for (const v of visits) {
    const count = Math.max(v.localPhotoIds?.length ?? 0, v.photoUrls?.length ?? 0);
    for (let i = 0; i < count; i++) {
      const id = v.localPhotoIds?.[i];
      const url = v.photoUrls?.[i];
      if (id && seenIds.has(id)) continue;
      if (url && seenUrls.has(url)) continue;
      if (id || url) {
        if (id) seenIds.add(id);
        if (url) seenUrls.add(url);
        items.push({
          key: id || url || `visit-${v.id ?? "v"}-${i}`,
          id,
          url,
        });
      }
    }
  }

  // 3. Additional spot-level photoUrls
  for (const url of spot?.photoUrls ?? []) {
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url);
      items.push({
        key: url,
        url,
      });
    }
  }

  return items;
}
