import { CATALOG_BY_ID, itemFitsGender, STARTER_ITEM_IDS } from "../avatar/catalog";
import { avatarConfigSchema, OUTFIT_SLOTS, type AvatarConfig } from "../avatar/config";
import type { Feature } from "../features";

// Wardrobe purchases and avatar saves. Ownership, gender fit and plan access
// are all checked here on the server; the client only sends ids.

export interface ShopAccess {
  features: Set<Feature>;
  gender: "male" | "female";
  characterId: string;
}

export interface ShopDeps {
  getAccess(userId: string): Promise<ShopAccess | null>;
  ownedItems(userId: string): Promise<Set<string>>;
  purchaseItem(userId: string, itemId: string): Promise<{ ok: boolean; reason: string; balance: number | null }>;
  saveAvatarConfig(characterId: string, config: AvatarConfig): Promise<void>;
}

export type ShopResult<T = object> = ({ ok: true } & T) | { ok: false; status: number; error: string };

export async function buyItem(deps: ShopDeps, userId: string, itemId: unknown): Promise<ShopResult<{ balance: number }>> {
  if (typeof itemId !== "string") return { ok: false, status: 400, error: "itemId required" };
  const access = await deps.getAccess(userId);
  if (!access) return { ok: false, status: 409, error: "Finish onboarding first" };
  if (!access.features.has("wardrobe")) return { ok: false, status: 402, error: "The wardrobe shop is part of paid plans" };

  const item = CATALOG_BY_ID.get(itemId);
  if (!item || item.exclusive || item.starter) return { ok: false, status: 400, error: "This item isn't for sale" };
  if (!itemFitsGender(item, access.gender)) return { ok: false, status: 400, error: "This item doesn't fit your partner" };

  const r = await deps.purchaseItem(userId, itemId);
  if (r.ok) return { ok: true, balance: r.balance ?? 0 };
  const errors: Record<string, [number, string]> = {
    owned: [409, "You already own this"],
    insufficient: [402, "Not enough coins"],
    not_for_sale: [400, "This item isn't for sale"],
  };
  const [status, error] = errors[r.reason] ?? [400, "Purchase failed"];
  return { ok: false, status, error };
}

export async function saveAvatar(deps: ShopDeps, userId: string, raw: unknown): Promise<ShopResult<{ config: AvatarConfig }>> {
  const access = await deps.getAccess(userId);
  if (!access) return { ok: false, status: 409, error: "Finish onboarding first" };
  if (!access.features.has("avatar_studio")) return { ok: false, status: 402, error: "The avatar studio is part of paid plans" };

  const parsed = avatarConfigSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, status: 400, error: "Invalid avatar settings" };
  const config = parsed.data;

  const owned = await deps.ownedItems(userId);
  for (const id of STARTER_ITEM_IDS) owned.add(id);

  for (const slot of OUTFIT_SLOTS) {
    const id = config.outfit[slot];
    if (!id) continue;
    const item = CATALOG_BY_ID.get(id);
    if (!item || item.slot !== slot) return { ok: false, status: 400, error: `Unknown item in ${slot}` };
    if (!owned.has(id)) return { ok: false, status: 403, error: `You don't own ${item.name}` };
    if (!itemFitsGender(item, access.gender)) return { ok: false, status: 400, error: `${item.name} doesn't fit your partner` };
  }
  // A dress replaces top and bottom.
  if (config.outfit.dress) {
    delete config.outfit.top;
    delete config.outfit.bottom;
  }

  await deps.saveAvatarConfig(access.characterId, config);
  return { ok: true, config };
}
