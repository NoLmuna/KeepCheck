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
}

class KeepCheckDB extends Dexie {
  spots!: Table<FoodSpotLog, number>;

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
  }
}

export const db = new KeepCheckDB();
