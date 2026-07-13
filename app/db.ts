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
}

/** Full-resolution image associated with a spot (one image per spot). */
export interface SpotImage {
  id?: number;
  /** Foreign key → FoodSpotLog.id */
  spotId: number;
  /** Compressed JPEG binary — stored but NOT indexed. */
  blob: Blob;
  createdAt: number; // epoch ms
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
    // The spots index string is unchanged because `thumbnail` is NOT
    // indexed (Dexie only requires indexed fields in the schema string).
    // The images store indexes `spotId` for cascade-delete lookups and
    // `createdAt` for chronological queries; `blob` is stored but never
    // indexed to save space.
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
            // Backfill — existing rows simply get `undefined` so the
            // TypeScript `?` optional field is satisfied. This is a
            // no-op for the data but documents the migration intent.
            if (spot.thumbnail === undefined) {
              spot.thumbnail = undefined;
            }
          })
      );
  }
}

export const db = new KeepCheckDB();
