import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOG } from "@/lib/avatar/catalog";
import { defaultAvatar, normaliseAvatar, type AvatarConfig } from "@/lib/avatar/config";
import type { Feature } from "@/lib/features";
import { buyItem, saveAvatar, type ShopDeps } from "@/lib/shop/shop";
import { USER } from "./fakes";

function makeShop(opts: { features?: Feature[]; gender?: "male" | "female"; owned?: string[]; balance?: number }) {
  const owned = new Set(opts.owned ?? []);
  let balance = opts.balance ?? 0;
  let saved: AvatarConfig | null = null;
  const deps: ShopDeps = {
    getAccess: async () => ({ features: new Set(opts.features ?? ["wardrobe", "avatar_studio"]), gender: opts.gender ?? "female", characterId: "c" }),
    ownedItems: async () => new Set(owned),
    purchaseItem: async (_u, id) => {
      const item = CATALOG.find((i) => i.id === id)!;
      if (owned.has(id)) return { ok: false, reason: "owned", balance };
      if (balance < item.price_coins) return { ok: false, reason: "insufficient", balance };
      balance -= item.price_coins;
      owned.add(id);
      return { ok: true, reason: "ok", balance };
    },
    saveAvatarConfig: async (_c, cfg) => void (saved = cfg),
  };
  return { deps, owned, saved: () => saved };
}

describe("wardrobe shop", () => {
  it("sells items for coins", async () => {
    const s = makeShop({ balance: 100 });
    expect(await buyItem(s.deps, USER, "hoodie_mustard")).toEqual({ ok: true, balance: 20 });
    expect(await buyItem(s.deps, USER, "hoodie_mustard")).toMatchObject({ ok: false, status: 409 });
    expect(await buyItem(s.deps, USER, "gown_emerald")).toMatchObject({ ok: false, status: 402, error: "Not enough coins" });
  });

  it("is locked without a plan that includes the wardrobe", async () => {
    const s = makeShop({ features: ["coach", "memory"], balance: 1000 });
    expect(await buyItem(s.deps, USER, "hoodie_mustard")).toMatchObject({ ok: false, status: 402 });
  });

  it("never sells gift-only items, starter items, or items that don't fit the partner", async () => {
    const s = makeShop({ balance: 1000, gender: "male" });
    expect(await buyItem(s.deps, USER, "gift_birthday_gown")).toMatchObject({ ok: false, status: 400 });
    expect(await buyItem(s.deps, USER, "basic_jeans")).toMatchObject({ ok: false, status: 400 });
    expect(await buyItem(s.deps, USER, "gele_gold")).toMatchObject({ ok: false, status: 400 });
    expect(await buyItem(s.deps, USER, "no_such_item")).toMatchObject({ ok: false, status: 400 });
  });
});

describe("avatar studio", () => {
  it("saves a valid look using starter and owned items, and a dress replaces top and bottom", async () => {
    const s = makeShop({ owned: ["dress_red"] });
    const cfg = { ...defaultAvatar("female"), outfit: { top: "basic_tee_rose", bottom: "basic_jeans", dress: "dress_red" } };
    const r = await saveAvatar(s.deps, USER, cfg);
    expect(r.ok).toBe(true);
    expect(s.saved()?.outfit).toEqual({ dress: "dress_red" });
  });

  it("rejects items the user doesn't own, items in the wrong slot, and junk", async () => {
    const s = makeShop({});
    const base = defaultAvatar("female");
    expect(await saveAvatar(s.deps, USER, { ...base, outfit: { dress: "gown_emerald" } })).toMatchObject({ ok: false, status: 403 });
    expect(await saveAvatar(s.deps, USER, { ...base, outfit: { shoes: "basic_jeans" } })).toMatchObject({ ok: false, status: 400 });
    expect(await saveAvatar(s.deps, USER, { ...base, skinTone: 99 })).toMatchObject({ ok: false, status: 400 });
    expect(s.saved()).toBeNull();
  });

  it("is locked without a plan that includes the studio", async () => {
    const s = makeShop({ features: ["coach"] });
    expect(await saveAvatar(s.deps, USER, defaultAvatar("male"))).toMatchObject({ ok: false, status: 402 });
  });

  it("falls back to a default look for empty or invalid stored configs", () => {
    expect(normaliseAvatar({}, "male")).toEqual(defaultAvatar("male"));
  });
});

describe("catalog", () => {
  it("matches the shop_items seed in the migration", () => {
    const sql = readFileSync("supabase/migrations/0002_phase2.sql", "utf8");
    for (const item of CATALOG) {
      expect(sql).toContain(`('${item.id}', '${item.name.replace(/'/g, "''")}', '${item.slot}', '${item.gender}', ${item.price_coins}, ${!!item.exclusive}, ${!!item.starter})`);
    }
  });

  it("gives every default avatar only starter items", () => {
    for (const g of ["male", "female"] as const) {
      for (const id of Object.values(defaultAvatar(g).outfit)) {
        expect(CATALOG.find((i) => i.id === id)?.starter).toBe(true);
      }
    }
  });
});
