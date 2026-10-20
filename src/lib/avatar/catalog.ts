import type { OutfitSlot } from "./config";

// Wardrobe catalogue: how each item looks. Prices, availability and
// ownership live in the database (shop_items / inventory); the ids here must
// match the seed in supabase/migrations/0002_phase2.sql (checked by a test).

export type ItemStyle =
  | "tee" | "shirt" | "hoodie" | "kaftan" | "blouse"
  | "trousers" | "shorts" | "skirt"
  | "dress" | "gown"
  | "sneakers" | "heels" | "sandals"
  | "necklace" | "glasses" | "earrings"
  | "cap" | "gele" | "fila";

export type Pattern = "ankara" | "stripes" | null;

export interface CatalogItem {
  id: string;
  name: string;
  slot: OutfitSlot;
  style: ItemStyle;
  color: string;
  accent?: string;
  pattern?: Pattern;
  gender: "male" | "female" | "any";
  price_coins: number;
  // Exclusive items can't be bought; they arrive as gifts or plan perks.
  exclusive?: boolean;
  starter?: boolean; // owned by everyone
}

export const CATALOG: CatalogItem[] = [
  // Starter items everyone owns.
  { id: "basic_tee_rose", name: "Rose tee", slot: "top", style: "tee", color: "#e86a92", gender: "any", price_coins: 0, starter: true },
  { id: "basic_tee_navy", name: "Navy tee", slot: "top", style: "tee", color: "#2d3a63", gender: "any", price_coins: 0, starter: true },
  { id: "basic_jeans", name: "Blue jeans", slot: "bottom", style: "trousers", color: "#3c5a8a", gender: "any", price_coins: 0, starter: true },
  { id: "basic_sneakers", name: "White sneakers", slot: "shoes", style: "sneakers", color: "#f2f2f2", accent: "#999", gender: "any", price_coins: 0, starter: true },

  // Tops
  { id: "shirt_white", name: "Crisp white shirt", slot: "top", style: "shirt", color: "#fafafa", accent: "#d0d0d0", gender: "any", price_coins: 60 },
  { id: "hoodie_mustard", name: "Mustard hoodie", slot: "top", style: "hoodie", color: "#d9a21b", gender: "any", price_coins: 80 },
  { id: "kaftan_wine", name: "Wine kaftan", slot: "top", style: "kaftan", color: "#6e1a37", accent: "#e8c36a", gender: "male", price_coins: 150 },
  { id: "kaftan_ankara", name: "Ankara kaftan", slot: "top", style: "kaftan", color: "#1f6f8b", accent: "#f2a541", pattern: "ankara", gender: "male", price_coins: 180 },
  { id: "blouse_ankara", name: "Ankara blouse", slot: "top", style: "blouse", color: "#c2185b", accent: "#ffd54f", pattern: "ankara", gender: "female", price_coins: 120 },
  { id: "blouse_lilac", name: "Lilac blouse", slot: "top", style: "blouse", color: "#b39ddb", gender: "female", price_coins: 70 },

  // Bottoms
  { id: "trousers_black", name: "Black trousers", slot: "bottom", style: "trousers", color: "#222", gender: "any", price_coins: 60 },
  { id: "trousers_cream", name: "Cream chinos", slot: "bottom", style: "trousers", color: "#e9dcc3", gender: "any", price_coins: 60 },
  { id: "shorts_khaki", name: "Khaki shorts", slot: "bottom", style: "shorts", color: "#b59b6d", gender: "any", price_coins: 40 },
  { id: "skirt_pleated", name: "Pleated skirt", slot: "bottom", style: "skirt", color: "#37474f", gender: "female", price_coins: 70 },
  { id: "skirt_ankara", name: "Ankara skirt", slot: "bottom", style: "skirt", color: "#00897b", accent: "#ff7043", pattern: "ankara", gender: "female", price_coins: 110 },

  // Dresses
  { id: "dress_red", name: "Red date-night dress", slot: "dress", style: "dress", color: "#c62828", gender: "female", price_coins: 160 },
  { id: "dress_ankara", name: "Ankara dress", slot: "dress", style: "dress", color: "#6a1b9a", accent: "#ffca28", pattern: "ankara", gender: "female", price_coins: 200 },
  { id: "gown_emerald", name: "Emerald gown", slot: "dress", style: "gown", color: "#1b5e20", gender: "female", price_coins: 260 },

  // Shoes
  { id: "sneakers_black", name: "Black sneakers", slot: "shoes", style: "sneakers", color: "#222", accent: "#eee", gender: "any", price_coins: 50 },
  { id: "heels_nude", name: "Nude heels", slot: "shoes", style: "heels", color: "#d7a98c", gender: "female", price_coins: 80 },
  { id: "sandals_brown", name: "Leather sandals", slot: "shoes", style: "sandals", color: "#6d4c41", gender: "any", price_coins: 50 },

  // Accessories & headwear
  { id: "glasses_round", name: "Round glasses", slot: "accessory", style: "glasses", color: "#333", gender: "any", price_coins: 40 },
  { id: "necklace_gold", name: "Gold chain", slot: "accessory", style: "necklace", color: "#e0b43c", gender: "any", price_coins: 90 },
  { id: "earrings_hoops", name: "Gold hoops", slot: "accessory", style: "earrings", color: "#e0b43c", gender: "female", price_coins: 60 },
  { id: "cap_black", name: "Black cap", slot: "headwear", style: "cap", color: "#212121", gender: "any", price_coins: 40 },
  { id: "fila_wine", name: "Wine fila cap", slot: "headwear", style: "fila", color: "#6e1a37", gender: "male", price_coins: 70 },
  { id: "gele_gold", name: "Gold gele", slot: "headwear", style: "gele", color: "#e0b43c", accent: "#b8860b", gender: "female", price_coins: 140 },

  // Exclusive: gifts and plan perks only.
  { id: "gift_birthday_gown", name: "Birthday gown", slot: "dress", style: "gown", color: "#ad1457", accent: "#f8bbd0", gender: "female", price_coins: 0, exclusive: true },
  { id: "gift_birthday_agbada", name: "Birthday kaftan", slot: "top", style: "kaftan", color: "#0d47a1", accent: "#ffd54f", pattern: "ankara", gender: "male", price_coins: 0, exclusive: true },
  { id: "gift_streak_hoodie", name: "30-day streak hoodie", slot: "top", style: "hoodie", color: "#d6336c", gender: "any", price_coins: 0, exclusive: true },
  { id: "gift_anniversary_necklace", name: "Anniversary necklace", slot: "accessory", style: "necklace", color: "#f5f5f5", gender: "any", price_coins: 0, exclusive: true },
];

export const CATALOG_BY_ID = new Map(CATALOG.map((i) => [i.id, i]));
export const STARTER_ITEM_IDS = CATALOG.filter((i) => i.starter).map((i) => i.id);

export function itemFitsGender(item: CatalogItem, gender: "male" | "female") {
  return item.gender === "any" || item.gender === gender;
}
