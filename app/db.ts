import Dexie, { type Table } from "dexie";

/** Schema for a single food/drink spot log entry. */
export interface FoodSpotLog {
  id?: number;
  name: string;
  rating: number; // 1–10
  comment: string;
  createdAt: number; // epoch ms
}

class KeepCheckDB extends Dexie {
  spots!: Table<FoodSpotLog, number>;

  constructor() {
    super("KeepCheckDB");
    this.version(1).stores({
      spots: "++id, name, rating, createdAt",
    });
  }
}

export const db = new KeepCheckDB();
