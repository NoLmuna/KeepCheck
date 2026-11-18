/**
 * Offline-first image compression utilities.
 *
 * Uses native browser Canvas + createImageBitmap APIs — zero external
 * dependencies. EXIF orientation from mobile cameras is handled
 * automatically via `imageOrientation: "from-image"`.
 *
 * HEIC compatibility note:
 * ─────────────────────────
 * `createImageBitmap` / Canvas can only process formats the browser can
 * natively decode. HEIC is decoded natively by Safari (and all iOS
 * WebViews, including Chrome-on-iOS). Android cameras default to JPEG,
 * so this is a non-issue for the primary PWA use-case. Desktop
 * Chrome / Firefox cannot decode HEIC — callers should catch decode
 * errors and surface a user-friendly message.
 */

/* ------------------------------------------------------------------ */
/*  Shared resize helper                                               */
/* ------------------------------------------------------------------ */

/**
 * Decode a `Blob` (or `File`, which extends `Blob`) into an
 * EXIF-corrected `ImageBitmap`, draw it onto a canvas at the requested
 * maximum dimension, and return the canvas.
 */
async function resizeToCanvas(
  source: Blob,
  maxDimension: number,
): Promise<HTMLCanvasElement> {
  // Cap max dimension to 1600px for mobile memory safety
  const safeMax = Math.min(maxDimension, 1600);

  // `imageOrientation: "from-image"` tells the browser to apply the
  // EXIF rotation before returning pixel data — prevents sideways photos
  // from mobile cameras.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source, {
      imageOrientation: "from-image",
    });
  } catch {
    bitmap = await createImageBitmap(source);
  }

  let { width, height } = bitmap;

  // Scale down proportionally if the image exceeds `safeMax`.
  if (width > safeMax || height > safeMax) {
    const ratio = Math.min(safeMax / width, safeMax / height);
    width = Math.max(1, Math.round(width * ratio));
    height = Math.max(1, Math.round(height * ratio));
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
    throw new Error("Canvas context 2D unavailable");
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close(); // free GPU memory

  return canvas;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Generate a lightweight Base64 JPEG data-URL thumbnail.
 *
 * Intended for inline rendering in card lists — small enough to store
 * directly in the Dexie `spots` table alongside text fields.
 *
 * The default `maxSize` of 400px is chosen to match the card grid's
 * maximum rendered width across all current breakpoints (1-col mobile
 * ≈ 398px, 2-col md ≈ 352px, 3-col lg ≈ 309px). If the card layout
 * is ever widened, bump this value to avoid upscale blur.
 *
 * @param file    - Raw image file from `<input type="file">`.
 * @param maxSize - Maximum width OR height in px (default 400).
 * @param quality - JPEG quality 0–1 (default 0.75).
 * @returns Base64 data-URL string (`data:image/jpeg;base64,…`).
 */
export async function makeThumbnail(
  file: File,
  maxSize = 400,
  quality = 0.75,
): Promise<string> {
  const canvas = await resizeToCanvas(file, maxSize);
  try {
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Re-generate a thumbnail from an already-stored JPEG `Blob`.
 *
 * Used by the detail modal's "Regenerate thumbnail" action to fix
 * old 150px thumbnails that were created before the resolution bump.
 *
 * @param blob    - Full-resolution Blob from the `images` store.
 * @param maxSize - Maximum width OR height in px (default 400).
 * @param quality - JPEG quality 0–1 (default 0.75).
 * @returns Base64 data-URL string.
 */
export async function makeThumbnailFromBlob(
  blob: Blob,
  maxSize = 400,
  quality = 0.75,
): Promise<string> {
  const canvas = await resizeToCanvas(blob, maxSize);
  try {
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Compress a camera photo to a web-optimised JPEG Blob.
 *
 * Stored in the Dexie `images` table as a full-resolution (but
 * compressed) binary, retrieved only when the user opens a detail view.
 *
 * @param file     - Raw image file from `<input type="file">`.
 * @param maxWidth - Maximum width in px (default 1600). Height scales
 *                   proportionally.
 * @param quality  - JPEG quality 0–1 (default 0.8).
 * @returns Compressed JPEG `Blob`.
 */
export async function compressToBlob(
  file: File,
  maxWidth = 1600,
  quality = 0.8,
): Promise<Blob> {
  const canvas = await resizeToCanvas(file, Math.min(maxWidth, 1600));

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        canvas.width = 0;
        canvas.height = 0;
        if (blob) resolve(blob);
        else reject(new Error("Canvas → Blob conversion failed."));
      },
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Convert a Blob into a base64 JPEG data-URL, making sure it stays
 * safely under the target Firestore document size limit (e.g. ~700KB
 * to leave headroom for other fields under the 1 MiB limit).
 * If the resulting base64 string exceeds 700KB, it is progressively
 * re-compressed with lower quality. If it still exceeds the limit
 * after 3 retries, returns null.
 *
 * NOTE: Oversized document writes will fail Firestore's 1 MiB write limit
 * outright with no clear error, so this check prevents sync failures.
 */
export async function compressBlobToSafeBase64(
  blob: Blob,
  maxDimension = 900,
  initialQuality = 0.7,
): Promise<string | null> {
  let quality = initialQuality;
  let canvas: HTMLCanvasElement;
  try {
    canvas = await resizeToCanvas(blob, maxDimension);
  } catch (err) {
    console.error("[KeepCheck] Failed to decode blob for re-compression:", err);
    return null;
  }

  try {
    let base64 = canvas.toDataURL("image/jpeg", quality);
    const targetLimitBytes = 700 * 1024; // 700KB string length

    let retries = 0;
    while (base64.length > targetLimitBytes && retries < 3) {
      retries++;
      quality -= 0.15; // Step down quality (e.g. 0.7 -> 0.55 -> 0.40 -> 0.25)
      if (quality < 0.1) {
        break;
      }
      console.log(`[KeepCheck] Base64 image size (${Math.round(base64.length / 1024)}KB) exceeds 700KB limit. Re-compressing with quality ${quality.toFixed(2)} (retry ${retries}/3)...`);
      base64 = canvas.toDataURL("image/jpeg", quality);
    }

    if (base64.length > targetLimitBytes) {
      console.warn(`[KeepCheck] Base64 image still too large (${Math.round(base64.length / 1024)}KB) after retries. Skipping sync to Firestore to prevent oversized document failure.`);
      return null;
    }

    return base64;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
