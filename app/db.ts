import Dexie, { type Table } from "dexie";
import type { Spot, VisitLog, SpotCollection, QueuedPhoto } from "@/lib/models";
import { migrateLegacyRecords } from "@/lib/legacyMigration";

/** The two supported spot categories. */
export type LegacySpotCategory = "Cafe" | "Restaurant";
export type {
  SpotCategory,
  Spot,
  VisitLog,
  SpotCollection,
  QueuedPhoto,
} from "@/lib/models";

export interface SpotLocation {
  lat: number;
  lng: number;
  formattedAddress: string;
  locality?: string;
  osmId?: string;
}

/** Schema for a single food/drink spot log entry. */
export interface FoodSpotLog {
  id?: number;
  name: string;
  category: LegacySpotCategory;
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
  latitude?: number;
  longitude?: number;
  location?: SpotLocation;
  venueCategory?: "coffee" | "restaurant" | "bakery" | "bar" | "other";
  updatedAt?: number;
  syncStatus?: "synced" | "pending" | "error";
  isDeleted?: boolean;
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
  venues!: Table<Spot, string>;
  visitLogs!: Table<VisitLog, string>;
  collections!: Table<SpotCollection, string>;
  photoQueue!: Table<QueuedPhoto, string>;
  syncState!: Table<{ id: string; updatedAt: number }, string>;

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
          }),
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
          }),
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
          }),
      );

    // v5 — adds `pendingSync` index for offline-first sync tracking.
    // When a spot is saved locally but hasn't been synced to Firestore
    // yet, pendingSync = true. The sync manager uses this index to
    // efficiently sweep all unsynced entries.
    this.version(5)
      .stores({
        spots:
          "++id, name, category, rating, createdAt, firebaseId, userId, pendingSync",
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
          }),
      );

    // v6 — adds `latitude` and `longitude` fields to spots for the map view.
    this.version(6)
      .stores({
        spots:
          "++id, name, category, rating, createdAt, firebaseId, userId, pendingSync",
        images: "++id, spotId, createdAt, firebaseId",
      })
      .upgrade((tx) =>
        tx
          .table<FoodSpotLog>("spots")
          .toCollection()
          .modify((spot) => {
            if (spot.latitude === undefined) {
              spot.latitude = undefined;
            }
            if (spot.longitude === undefined) {
              spot.longitude = undefined;
            }
          }),
      );
    // Keep legacy coordinates and IDs intact; unlocated records stay unlocated.
    this.version(7)
      .stores({
        spots:
          "++id, name, category, rating, createdAt, firebaseId, userId, pendingSync, updatedAt",
        images: "++id, spotId, createdAt, firebaseId",
      })
      .upgrade((tx) =>
        tx
          .table<FoodSpotLog>("spots")
          .toCollection()
          .modify((spot) => {
            spot.updatedAt ??= spot.createdAt;
            spot.syncStatus ??= spot.pendingSync ? "pending" : "synced";
            if (
              !spot.location &&
              spot.latitude !== undefined &&
              spot.longitude !== undefined
            ) {
              spot.location = {
                lat: spot.latitude,
                lng: spot.longitude,
                formattedAddress: `${spot.latitude.toFixed(5)}, ${spot.longitude.toFixed(5)}`,
              };
            }
          }),
      );
    // Archive the original numeric-key stores intact. All new UI uses normalized venues.
    this.version(8)
      .stores({
        spots:
          "++id, name, category, rating, createdAt, firebaseId, userId, pendingSync, updatedAt",
        images: "++id, spotId, createdAt, firebaseId",
        venues:
          "id, userId, status, category, updatedAt, syncStatus, location.osmId",
        visitLogs: "id, spotId, userId, visitedAt, updatedAt, syncStatus",
        collections: "id, userId, updatedAt, syncStatus",
        photoQueue: "id, spotId, visitLogId, userId, status",
        syncState: "id",
      })
      .upgrade(async (tx) => {
        const legacy = await tx.table<FoodSpotLog>("spots").toArray();
        const images = await tx.table<SpotImage>("images").toArray();
        const result = migrateLegacyRecords(legacy, images);
        await tx.table("venues").bulkPut(result.spots);
        await tx.table("visitLogs").bulkPut(result.visits);
        await tx.table("photoQueue").bulkPut(result.photos);
      });
  }
}

export const db = new KeepCheckDB();
