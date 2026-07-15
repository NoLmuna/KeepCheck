import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
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
