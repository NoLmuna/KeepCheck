/**
 * Firebase Storage helpers for spot images.
 *
 * Replaces the old Firestore-based Base64 image storage with binary
 * blob uploads to Firebase Storage. This avoids hitting Firestore's
 * 1 MiB document limit and dramatically reduces sync bandwidth.
 *
 * Each spot gets one image at:
 *   `users/{uid}/spots/{spotFirebaseId}/photo.jpg`
 */

import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { getFirebaseStorage } from "./firebase";

/* ------------------------------------------------------------------ */
/*  Path helper                                                        */
/* ------------------------------------------------------------------ */

function spotImageRef(uid: string, spotFirebaseId: string) {
  return ref(
    getFirebaseStorage(),
    `users/${uid}/spots/${spotFirebaseId}/photo.jpg`,
  );
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Upload a compressed JPEG blob to Firebase Storage and return the
 * permanent download URL.
 *
 * @param uid             - Firebase Auth UID of the image owner.
 * @param spotFirebaseId  - Firestore document ID of the parent spot.
 * @param blob            - Compressed JPEG binary from `compressToBlob`.
 * @returns The public download URL string.
 */
export async function uploadSpotImage(
  uid: string,
  spotFirebaseId: string,
  blob: Blob,
): Promise<string> {
  const imageRef = spotImageRef(uid, spotFirebaseId);
  await uploadBytes(imageRef, blob, {
    contentType: "image/jpeg",
  });
  return getDownloadURL(imageRef);
}

/**
 * Delete a spot's image from Firebase Storage.
 *
 * Swallows `storage/object-not-found` so the caller doesn't need to
 * guard against double-deletes or spots that never had an image.
 *
 * @param uid             - Firebase Auth UID of the image owner.
 * @param spotFirebaseId  - Firestore document ID of the parent spot.
 */
export async function deleteSpotImage(
  uid: string,
  spotFirebaseId: string,
): Promise<void> {
  try {
    await deleteObject(spotImageRef(uid, spotFirebaseId));
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "storage/object-not-found") {
      // Image doesn't exist — nothing to delete, not an error.
      return;
    }
    throw err;
  }
}
