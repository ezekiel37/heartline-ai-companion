"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import type { CatalogItem } from "@/lib/avatar/catalog";
import type { AvatarConfig } from "@/lib/avatar/config";
import { formatNaira, type CoinPack } from "@/lib/plans";

export function ShopClient(props: {
  unlocked: boolean;
  coins: number;
  packs: CoinPack[];
  items: CatalogItem[];
  owned: string[];
  avatar: AvatarConfig;
  partnerName: string;
}) {
  const [coins, setCoins] = useState(props.coins);
  const [owned, setOwned] = useState(new Set(props.owned));
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function buyPack(packId: string) {
    setBusy(packId);
    setMessage(null);
    const res = await fetch("/api/paystack/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packId }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.url) {
      window.location.href = body.url;
      return;
    }
    setBusy(null);
    setMessage(body.error ?? "Could not start payment.");
  }

  async function buyItem(item: CatalogItem) {
    setBusy(item.id);
    setMessage(null);
    const res = await fetch("/api/shop/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok) {
      setCoins(body.balance);
      setOwned((o) => new Set(o).add(item.id));
      setMessage(`${item.name} is in ${props.partnerName}'s wardrobe. Put it on in the Studio.`);
    } else {
      setMessage(body.error ?? "Purchase failed");
    }
  }

  // Preview the item on the partner, replacing whatever it conflicts with.
  const tryOn = (item: CatalogItem): AvatarConfig => {
    const outfit = { ...props.avatar.outfit, [item.slot]: item.id };
    if (item.slot === "dress") {
      delete outfit.top;
      delete outfit.bottom;
    }
    if (item.slot === "top" || item.slot === "bottom") {
      delete outfit.dress;
      outfit.top ??= "basic_tee_rose";
      outfit.bottom ??= "basic_jeans";
    }
    return { ...props.avatar, outfit };
  };

  return (
    <div className={`space-y-8 ${props.unlocked ? "" : "pointer-events-none opacity-50"}`} aria-disabled={!props.unlocked}>
      <section className="card flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm text-muted">Your coins</div>
          <div className="text-3xl font-bold">🪙 {coins}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {props.packs.map((p) => (
            <button key={p.id} className="btn-ghost" disabled={busy !== null} onClick={() => buyPack(p.id)}>
              {busy === p.id ? "Opening Paystack…" : `${p.coins} coins · ${formatNaira(p.price_kobo)}`}
            </button>
          ))}
        </div>
        <p className="w-full text-xs text-muted">
          Coin purchases are one-time payments, limited to ₦10,000 a day. Coins are only for outfits.{" "}
          <Link href="/terms" className="underline">Terms</Link>
        </p>
      </section>

      {message && <p className="rounded-xl bg-accent-soft p-3 text-sm" role="status">{message}</p>}

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {props.items.map((item) => {
          const has = owned.has(item.id);
          return (
            <div key={item.id} className="card flex flex-col items-center gap-2 p-3">
              <Avatar config={tryOn(item)} size={130} />
              <div className="text-center text-sm font-medium">{item.name}</div>
              {has ? (
                <span className="text-sm text-muted">Owned</span>
              ) : (
                <button className="btn w-full py-2 text-sm" disabled={busy !== null || coins < item.price_coins} onClick={() => buyItem(item)}>
                  {busy === item.id ? "Buying…" : `🪙 ${item.price_coins}`}
                </button>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
