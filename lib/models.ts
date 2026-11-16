export type SpotCategory = "coffee" | "restaurant" | "bakery" | "bar" | "other";
export type SpotStatus = "visited" | "wishlist";
export type BudgetTier = "₱" | "₱₱" | "₱₱₱";
export const vibeTags = [
  "fast-wifi",
  "power-outlets",
  "quiet-study",
  "air-conditioned",
  "parking",
  "open-late",
  "pet-friendly",
  "cash-only",
] as const;
export type VibeTag = (typeof vibeTags)[number];
export interface MenuItemNote {
  id: string;
  name: string;
  verdict: "must-order" | "skip";
  price?: number;
}
export interface SpotLocation {
  lat: number;
  lng: number;
  formattedAddress: string;
  locality?: string;
  osmId?: string;
}
export interface SyncRecord {
  id: string;
  userId?: string;
  createdAt: number;
  updatedAt: number;
  syncStatus: "synced" | "pending" | "error";
  isDeleted?: boolean;
}
export interface Spot extends SyncRecord {
  name: string;
  category: SpotCategory;
  status: SpotStatus;
  overallRating?: number;
  budgetTier?: BudgetTier;
  vibeTags: VibeTag[];
  menuItems: MenuItemNote[];
  collectionIds: string[];
  notes?: string;
  coverPhotoUrl?: string;
  localCoverPhotoId?: string;
  location: SpotLocation;
  /** Legacy journals without a location are preserved without placing a false map pin. */
  locationMissing?: boolean;
}
export interface VisitLog extends SyncRecord {
  spotId: string;
  visitedAt: number;
  rating: number;
  itemsOrdered: string[];
  totalSpend?: number;
  notes?: string;
  photoUrls: string[];
  localPhotoIds: string[];
}
export interface SpotCollection extends SyncRecord {
  name: string;
  description?: string;
}
export interface QueuedPhoto {
  id: string;
  spotId: string;
  visitLogId: string;
  userId?: string;
  blob?: Blob;
  thumbnail?: Blob;
  status: "pending" | "uploaded" | "failed";
  remoteUrl?: string;
  error?: string;
  createdAt: number;
}
