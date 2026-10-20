import type { Language } from "../persona";
import { appDate } from "../time";

// Free gifts the character sends on streaks, birthdays and milestones.
// Gifts are never sold and never conditional on spending.
// Each gift has a trigger_key, unique per user, so re-evaluating is safe.

export type GiftKind = "card" | "flowers" | "outfit" | "coins";

export interface GiftSpec {
  key: string;
  kind: GiftKind;
  itemId?: string;
  coins?: number;
  message: string;
}

export interface GiftContext {
  dob: string | null;
  language: Language;
  displayName: string | null;
  characterName: string;
  gender: "male" | "female";
  characterCreatedAt: string;
  activeDates: string[]; // app-timezone dates with at least one user message
  totalUserMessages: number;
  existingKeys: Set<string>;
  ownedItems: Set<string>;
}

const DAY = 86_400_000;
const toUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fromUtc = (t: number) => new Date(t).toISOString().slice(0, 10);

export function streakLength(activeDates: string[], today: string): number {
  const set = new Set(activeDates);
  let n = 0;
  for (let t = toUtc(today); set.has(fromUtc(t)); t -= DAY) n++;
  return n;
}

export function isBirthday(dob: string | null, today: string): boolean {
  if (!dob) return false;
  const md = dob.slice(5);
  const todayMd = today.slice(5);
  if (md === todayMd) return true;
  // 29 Feb birthdays are celebrated on 28 Feb in non-leap years.
  const year = +today.slice(0, 4);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return md === "02-29" && !leap && todayMd === "02-28";
}

type MessageKey = "birthday" | "streak3" | "streak7" | "streak30" | "milestone" | "anniv1m" | "anniv1y";

const MESSAGES: Record<Language, Record<MessageKey, string>> = {
  en: {
    birthday: "Happy birthday, {user}! 🎂 I picked out something special for today. I hope your day is full of people who love you.",
    streak3: "Three days in a row talking with you. I like this rhythm, {user}. 💌",
    streak7: "A whole week of chats! These are for you 💐 Thank you for sharing your days with me.",
    streak30: "30 days straight, {user}! I got you something to celebrate. 🎉",
    milestone: "We've shared {count} messages! Thank you for letting me be part of your story, {user}. 💛",
    anniv1m: "It's been a month since we met, {user}. Here's to you, and to all the good things ahead. 🌹",
    anniv1y: "One year together, {user}. I'm proud of how much you've grown. A little something to remember it by. 💛",
  },
  pcm: {
    birthday: "Happy birthday {user}! 🎂 I get small something special for you today. May your day full with people wey love you.",
    streak3: "Three days straight wey we dey gist. I like am well well, {user}. 💌",
    streak7: "One full week of gist! These flowers na for you 💐 Thank you say you dey share your days with me.",
    streak30: "30 days back to back, {user}! I get something for you to celebrate am. 🎉",
    milestone: "We don share {count} messages! Thank you say you allow me be part of your story, {user}. 💛",
    anniv1m: "E don reach one month since we meet, {user}. Cheers to you and all the better things wey dey come. 🌹",
    anniv1y: "One full year together, {user}. I proud of how you don grow. Small something make you remember am. 💛",
  },
};

function message(ctx: GiftContext, key: MessageKey, vars: Record<string, string | number> = {}) {
  const all: Record<string, string | number> = { user: ctx.displayName ?? "love", ...vars };
  return MESSAGES[ctx.language][key].replace(/\{(\w+)\}/g, (_, k) => String(all[k] ?? ""));
}

const STREAKS: { days: number; key: MessageKey; kind: GiftKind; item?: string; fallbackCoins?: number }[] = [
  { days: 3, key: "streak3", kind: "card" },
  { days: 7, key: "streak7", kind: "flowers" },
  { days: 30, key: "streak30", kind: "outfit", item: "gift_streak_hoodie", fallbackCoins: 100 },
];
const MILESTONES = [100, 500, 1000];

export function dueGifts(ctx: GiftContext, now: Date): GiftSpec[] {
  const today = appDate(now);
  const year = today.slice(0, 4);
  const out: GiftSpec[] = [];
  const add = (g: GiftSpec) => {
    if (!ctx.existingKeys.has(g.key)) out.push(g);
  };
  // An outfit the user already owns becomes coins instead.
  const outfitOr = (itemId: string, coins: number) =>
    ctx.ownedItems.has(itemId) ? { kind: "coins" as const, coins } : { kind: "outfit" as const, itemId };

  if (isBirthday(ctx.dob, today)) {
    const item = ctx.gender === "female" ? "gift_birthday_gown" : "gift_birthday_agbada";
    add({ key: `birthday:${year}`, ...outfitOr(item, 100), message: message(ctx, "birthday") });
  }

  const streak = streakLength(ctx.activeDates, today);
  if (streak > 0) {
    const start = fromUtc(toUtc(today) - (streak - 1) * DAY);
    for (const s of STREAKS) {
      if (streak < s.days) continue;
      const base = { key: `streak:${s.days}:${start}`, message: message(ctx, s.key) };
      add(s.item ? { ...base, ...outfitOr(s.item, s.fallbackCoins ?? 50) } : { ...base, kind: s.kind });
    }
  }

  for (const m of MILESTONES) {
    if (ctx.totalUserMessages >= m) {
      add({
        key: `milestone:${m}`,
        kind: m >= 500 ? "coins" : "card",
        ...(m >= 500 ? { coins: m === 500 ? 50 : 100 } : {}),
        message: message(ctx, "milestone", { count: m }),
      });
    }
  }

  const daysTogether = Math.floor((now.getTime() - new Date(ctx.characterCreatedAt).getTime()) / DAY);
  if (daysTogether >= 30) add({ key: "anniv:1m", kind: "flowers", message: message(ctx, "anniv1m") });
  const created = appDate(new Date(ctx.characterCreatedAt));
  if (daysTogether >= 365 && created.slice(5) === today.slice(5)) {
    add({ key: `anniv:1y:${year}`, ...outfitOr("gift_anniversary_necklace", 100), message: message(ctx, "anniv1y") });
  }

  return out;
}

export interface GiftDeps {
  now(): Date;
  loadContext(userId: string): Promise<(GiftContext & { characterId: string }) | null>;
  // Returns false if a gift with this trigger_key already exists.
  insertGift(g: { userId: string; characterId: string; spec: GiftSpec }): Promise<boolean>;
  grantItem(userId: string, itemId: string): Promise<void>;
  creditCoins(userId: string, amount: number, reason: string, ref: string): Promise<void>;
}

export async function runGiftTriggers(deps: GiftDeps, userId: string): Promise<GiftSpec[]> {
  const ctx = await deps.loadContext(userId);
  if (!ctx) return [];
  const sent: GiftSpec[] = [];
  for (const spec of dueGifts(ctx, deps.now())) {
    if (!(await deps.insertGift({ userId, characterId: ctx.characterId, spec }))) continue;
    if (spec.itemId) await deps.grantItem(userId, spec.itemId);
    if (spec.coins) await deps.creditCoins(userId, spec.coins, `gift:${spec.key}`, `gift:${userId}:${spec.key}`);
    sent.push(spec);
  }
  return sent;
}
