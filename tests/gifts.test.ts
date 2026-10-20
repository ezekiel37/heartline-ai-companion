import { describe, expect, it } from "vitest";
import { handleChat } from "@/lib/chat/handleChat";
import { dueGifts, isBirthday, runGiftTriggers, streakLength, type GiftContext, type GiftDeps } from "@/lib/gifts/triggers";
import { collect, makeChatDeps, USER } from "./fakes";

const NOW = new Date("2026-10-20T12:00:00Z"); // 13:00 in Lagos

function ctx(over: Partial<GiftContext> = {}): GiftContext {
  return {
    dob: "1995-05-05",
    language: "en",
    displayName: "Ada",
    characterName: "Tobi",
    gender: "male",
    characterCreatedAt: "2026-10-15T10:00:00Z",
    activeDates: [],
    totalUserMessages: 10,
    existingKeys: new Set(),
    ownedItems: new Set(),
    ...over,
  };
}

const days = (end: string, n: number) =>
  Array.from({ length: n }, (_, i) => new Date(Date.UTC(+end.slice(0, 4), +end.slice(5, 7) - 1, +end.slice(8, 10)) - i * 86_400_000).toISOString().slice(0, 10));

describe("gift triggers", () => {
  it("counts consecutive active days ending today", () => {
    expect(streakLength(days("2026-10-20", 7), "2026-10-20")).toBe(7);
    expect(streakLength(["2026-10-19", "2026-10-18"], "2026-10-20")).toBe(0);
    expect(streakLength([...days("2026-10-20", 2), ...days("2026-10-15", 5)], "2026-10-20")).toBe(2);
  });

  it("handles birthdays, including 29 February in non-leap years", () => {
    expect(isBirthday("1995-10-20", "2026-10-20")).toBe(true);
    expect(isBirthday("2000-02-29", "2027-02-28")).toBe(true);
    expect(isBirthday("2000-02-29", "2028-02-28")).toBe(false);
    expect(isBirthday(null, "2026-10-20")).toBe(false);
  });

  it("sends a birthday outfit in the user's language", () => {
    const g = dueGifts(ctx({ dob: "1995-10-20", language: "pcm" }), NOW);
    expect(g).toEqual([expect.objectContaining({ key: "birthday:2026", kind: "outfit", itemId: "gift_birthday_agbada" })]);
    expect(g[0].message).toMatch(/Happy birthday Ada/);
  });

  it("awards streak gifts once per streak, and swaps already-owned outfits for coins", () => {
    const c = ctx({ activeDates: days("2026-10-20", 30), ownedItems: new Set(["gift_streak_hoodie"]) });
    const g = dueGifts(c, NOW);
    expect(g.map((x) => x.key)).toEqual(["streak:3:2026-09-21", "streak:7:2026-09-21", "streak:30:2026-09-21"]);
    expect(g[2]).toMatchObject({ kind: "coins", coins: 100 });
    expect(dueGifts({ ...c, existingKeys: new Set(g.map((x) => x.key)) }, NOW)).toEqual([]);
  });

  it("marks message milestones and the one-month anniversary", () => {
    const g = dueGifts(ctx({ totalUserMessages: 520, characterCreatedAt: "2026-09-01T00:00:00Z" }), NOW);
    expect(g.map((x) => x.key)).toEqual(["milestone:100", "milestone:500", "anniv:1m"]);
    expect(g[1]).toMatchObject({ kind: "coins", coins: 50 });
  });

  it("delivers each gift once and grants items and coins", async () => {
    const keys = new Set<string>();
    const granted: string[] = [];
    let coins = 0;
    const deps: GiftDeps = {
      now: () => NOW,
      loadContext: async () => ({ ...ctx({ dob: "1995-10-20", totalUserMessages: 500 }), existingKeys: new Set(keys), characterId: "c" }),
      insertGift: async ({ spec }) => (keys.has(spec.key) ? false : (keys.add(spec.key), true)),
      grantItem: async (_u, id) => void granted.push(id),
      creditCoins: async (_u, n) => void (coins += n),
    };
    expect((await runGiftTriggers(deps, USER)).length).toBe(3);
    expect(await runGiftTriggers(deps, USER)).toEqual([]);
    expect(granted).toEqual(["gift_birthday_agbada"]);
    expect(coins).toBe(50);
  });

  it("only runs gift triggers for plans that include gifts", async () => {
    const free = makeChatDeps({ now: NOW });
    const paid = makeChatDeps({
      now: NOW,
      subscription: { user_id: USER, plan_id: "two_week", status: "active", current_period_end: "2026-10-30T00:00:00Z" },
    });
    for (const t of [free, paid]) {
      const r = await handleChat(t.deps, USER, "hey");
      if (!r.ok) throw new Error("expected ok");
      await collect(r.events);
      await r.runBackground();
    }
    expect(free.giftRuns()).toBe(0);
    expect(paid.giftRuns()).toBe(1);
  });
});
