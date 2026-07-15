import Dexie, { type Table } from "dexie";

/** The two supported spot categories. */
export type SpotCategory = "Cafe" | "Restaurant";

/** Schema for a single food/drink spot log entry. */
export interface FoodSpotLog {
  id?: number;
  name: string;
  category: SpotCategory;
  rating: number; // 1–10
  comment: string;
  createdAt: number; // epoch ms
  /** Base64 JPEG data-URL thumbnail for fast list rendering. */
  thumbnail?: string;
  /** Firestore document ID (for cloud sync). */
  firebaseId?: string;
  /** Firebase Auth UID that owns this entry. */
  userId?: string;
  /** True when the entry has been saved locally but not yet synced to Firestore. */
  pendingSync?: boolean;
  /** Firebase Storage download URL for the full-resolution image. */
  downloadURL?: string;
}

/** Full-resolution image associated with a spot (one image per spot). */
export interface SpotImage {
  id?: number;
  /** Foreign key → FoodSpotLog.id */
  spotId: number;
  /** Compressed JPEG binary — stored but NOT indexed. */
  blob: Blob;
  createdAt: number; // epoch ms
  /** Firestore document ID for the image. */
  firebaseId?: string;
}

class KeepCheckDB extends Dexie {
  spots!: Table<FoodSpotLog, number>;
  images!: Table<SpotImage, number>;

  constructor() {
    super("KeepCheckDB");

    // v1 — original schema (no category)
    this.version(1).stores({
      spots: "++id, name, rating, createdAt",
    });

    // v2 — adds indexed `category` column + migrates existing rows
    this.version(2)
      .stores({
        spots: "++id, name, category, rating, createdAt",
      })
      .upgrade((tx) =>
        tx
          .table<FoodSpotLog>("spots")
          .toCollection()
          .modify((spot) => {
            if (!spot.category) {
              spot.category = "Restaurant";
            }
          })
      );

    // v3 — adds `images` store + optional `thumbnail` field on spots.
    this.version(3)
      .stores({
        spots: "++id, name, category, rating, createdAt",
        images: "++id, spotId, createdAt",
      })
      .upgrade((tx) =>
        tx
          .table<FoodSpotLog>("spots")
          .toCollection()
          .modify((spot) => {
            if (spot.thumbnail === undefined) {
              spot.thumbnail = undefined;
            }
          })
      );

    // v4 — adds `firebaseId` and `userId` fields for cloud sync.
    // These are indexed so we can look up spots by their Firestore ID
    // and filter by user.
    this.version(4)
      .stores({
        spots: "++id, name, category, rating, createdAt, firebaseId, userId",
        images: "++id, spotId, createdAt, firebaseId",
      })
      .upgrade((tx) =>
        tx
          .table<FoodSpotLog>("spots")
          .toCollection()
          .modify((spot) => {
            if (spot.firebaseId === undefined) {
              spot.firebaseId = undefined;
            }
            if (spot.userId === undefined) {
              spot.userId = undefined;
            }
          })
      );

    // v5 — adds `pendingSync` index for offline-first sync tracking.
    // When a spot is saved locally but hasn't been synced to Firestore
    // yet, pendingSync = true. The sync manager uses this index to
    // efficiently sweep all unsynced entries.
    this.version(5)
      .stores({
        spots: "++id, name, category, rating, createdAt, firebaseId, userId, pendingSync",
        images: "++id, spotId, createdAt, firebaseId",
      })
      .upgrade((tx) =>
        tx
          .table<FoodSpotLog>("spots")
          .toCollection()
          .modify((spot) => {
            if (spot.pendingSync === undefined) {
              spot.pendingSync = false;
            }
          })
      );
  }
}

export const db = new KeepCheckDB();
