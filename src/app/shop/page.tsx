import { AppNav, LockedNotice } from "@/components/AppNav";
import { loadPartnerState } from "@/lib/access";
import { CATALOG, itemFitsGender } from "@/lib/avatar/catalog";
import type { CoinPack } from "@/lib/plans";
import { ShopClient } from "./ShopClient";

export const dynamic = "force-dynamic";

export default async function ShopPage() {
  const s = await loadPartnerState();
  const unlocked = s.features.has("wardrobe");

  const [{ data: packs }, { data: items }] = await Promise.all([
    s.supabase.from("coin_packs").select("*").order("sort"),
    s.supabase.from("shop_items").select("id, price_coins").eq("exclusive", false).eq("starter", false),
  ]);
  // Prices come from the database so they can be changed without a deploy.
  const prices = new Map((items ?? []).map((i) => [i.id as string, i.price_coins as number]));
  const forSale = CATALOG.filter((i) => prices.has(i.id) && itemFitsGender(i, s.gender)).map((i) => ({
    ...i,
    price_coins: prices.get(i.id)!,
  }));

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Wardrobe shop</h1>
        <AppNav current="/shop" />
      </header>
      {!unlocked && <LockedNotice feature="The wardrobe shop" />}
      <ShopClient
        unlocked={unlocked}
        coins={s.coins}
        packs={(packs ?? []) as CoinPack[]}
        items={forSale}
        owned={s.owned}
        avatar={s.avatar}
        partnerName={s.character.name}
      />
    </main>
  );
}
