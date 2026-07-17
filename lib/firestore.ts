import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseFirestore } from "./firebase";
import type { FoodSpotLog } from "@/app/db";

/* ------------------------------------------------------------------ */
/*  Path helpers                                                       */
/* ------------------------------------------------------------------ */

function spotsCol(uid: string) {
  return collection(getFirebaseFirestore(), "users", uid, "spots");
}

/* ------------------------------------------------------------------ */
/*  Spots                                                              */
/* ------------------------------------------------------------------ */

/** Pre-generate a Firestore document ID without writing anything. */
export function generateSpotId(uid: string): string {
  return doc(spotsCol(uid)).id;
}

/** Write a spot to Firestore using a pre-generated ID. */
export async function writeSpotToFirestore(
  uid: string,
  firebaseId: string,
  spot: Omit<FoodSpotLog, "id" | "firebaseId" | "userId">,
): Promise<void> {
  const docRef = doc(getFirebaseFirestore(), "users", uid, "spots", firebaseId);
  
  // Clean undefined properties to prevent Firestore error
  const cleanedSpot = Object.fromEntries(
    Object.entries(spot).filter(([_, v]) => v !== undefined)
  );

  await setDoc(docRef, {
    ...cleanedSpot,
    userId: uid,
  });
}

/** Delete a spot from Firestore by its document ID. */
export async function deleteSpotFromFirestore(
  uid: string,
  firebaseId: string,
): Promise<void> {
  await deleteDoc(doc(getFirebaseFirestore(), "users", uid, "spots", firebaseId));
}

/** Fetch all spots for a user (one-shot). */
export async function fetchSpotsFromFirestore(
  uid: string,
): Promise<(FoodSpotLog & { firebaseId: string })[]> {
  const q = query(spotsCol(uid), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({
    ...(d.data() as Omit<FoodSpotLog, "id" | "firebaseId">),
    firebaseId: d.id,
  }));
}

export interface FirestoreSpotChange {
  type: "added" | "modified" | "removed";
  spot: FoodSpotLog & { firebaseId: string };
}

/** Subscribe to real-time spot updates. Returns an unsubscribe function. */
export function subscribeToSpots(
  uid: string,
  callback: (changes: FirestoreSpotChange[]) => void,
): Unsubscribe {
  const q = query(spotsCol(uid), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    const changes = snapshot.docChanges().map((change) => ({
      type: change.type,
      spot: {
        ...(change.doc.data() as Omit<FoodSpotLog, "id" | "firebaseId">),
        firebaseId: change.doc.id,
      },
    }));
    callback(changes);
  });
}

/* ------------------------------------------------------------------ */
/*  Images                                                             */
/* ------------------------------------------------------------------ */

function imagesCol(uid: string) {
  return collection(getFirebaseFirestore(), "users", uid, "images");
}

/**
 * Add an image to Firestore.
 *
 * NOTE: We store the image as a base64 string (NOT a Blob) because
 * Firestore doesn't natively support Blob storage. The images are
 * already compressed JPEGs < 1 MB from the image utility pipeline.
 */
export async function addImageToFirestore(
  uid: string,
  image: {
    spotFirebaseId: string;
    base64: string;
    createdAt: number;
  },
): Promise<string> {
  const docRef = await addDoc(imagesCol(uid), {
    spotFirebaseId: image.spotFirebaseId,
    base64: image.base64,
    createdAt: image.createdAt,
    userId: uid,
  });
  return docRef.id;
}

/** Delete all images for a spot from Firestore. */
export async function deleteImagesForSpotFromFirestore(
  uid: string,
  spotFirebaseId: string,
): Promise<void> {
  const q = query(imagesCol(uid));
  const snapshot = await getDocs(q);
  const deleteOps = snapshot.docs
    .filter((d) => d.data().spotFirebaseId === spotFirebaseId)
    .map((d) => deleteDoc(d.ref));
  await Promise.all(deleteOps);
}

/** Subscribe to real-time image updates. Returns an unsubscribe function. */
export function subscribeToImages(
  uid: string,
  callback: (images: { firebaseId: string; spotFirebaseId: string; base64: string; createdAt: number }[]) => void,
): Unsubscribe {
  const q = query(imagesCol(uid), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    const images = snapshot.docs.map((d) => ({
      firebaseId: d.id,
      spotFirebaseId: d.data().spotFirebaseId as string,
      base64: d.data().base64 as string,
      createdAt: d.data().createdAt as number,
    }));
    callback(images);
  });
}
