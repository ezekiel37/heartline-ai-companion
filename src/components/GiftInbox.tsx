"use client";

import { useState } from "react";
import { CATALOG_BY_ID } from "@/lib/avatar/catalog";

export interface UiGift {
  id: string;
  kind: "card" | "flowers" | "outfit" | "coins";
  item_id: string | null;
  coins: number | null;
  message: string;
  sent_at: string;
  opened: boolean;
}

const ICONS: Record<UiGift["kind"], string> = { card: "💌", flowers: "💐", outfit: "👗", coins: "🪙" };

export function GiftInbox({ initial, partnerName }: { initial: UiGift[]; partnerName: string }) {
  const [gifts, setGifts] = useState(initial);
  const [open, setOpen] = useState(false);
  const unopened = gifts.filter((g) => !g.opened).length;

  if (!gifts.length) return null;

  async function unwrap(id: string) {
    setGifts((gs) => gs.map((g) => (g.id === id ? { ...g, opened: true } : g)));
    await fetch("/api/gifts/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ giftId: id }),
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative rounded-full px-2 py-1 text-lg"
        aria-label={`Gifts${unopened ? `, ${unopened} new` : ""}`}
      >
        🎁
        {unopened > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">{unopened}</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label="Gifts"
            className="max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-5 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Gifts from {partnerName}</h2>
              <button onClick={() => setOpen(false)} className="text-muted" aria-label="Close">✕</button>
            </div>
            <ul className="space-y-3">
              {gifts.map((g) => (
                <li key={g.id} className="rounded-2xl border border-border p-4">
                  {g.opened ? (
                    <div className="space-y-1">
                      <div className="text-2xl">{ICONS[g.kind]}</div>
                      <p className="text-sm">{g.message}</p>
                      {g.item_id && (
                        <p className="text-xs text-muted">
                          {CATALOG_BY_ID.get(g.item_id)?.name ?? "A new outfit"} was added to the wardrobe.
                        </p>
                      )}
                      {g.coins && <p className="text-xs text-muted">{g.coins} coins were added to your wallet.</p>}
                    </div>
                  ) : (
                    <button onClick={() => unwrap(g.id)} className="flex w-full items-center gap-3 text-left">
                      <span className="text-3xl">🎁</span>
                      <span>
                        <span className="block font-medium">A gift from {partnerName}</span>
                        <span className="text-sm text-muted">Tap to open</span>
                      </span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted">Gifts are always free.</p>
          </div>
        </div>
      )}
    </>
  );
}
