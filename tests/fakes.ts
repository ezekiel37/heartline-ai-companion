import type { ChatDeps, ChatEvent, ChatProfile } from "@/lib/chat/handleChat";
import type { WebhookDeps } from "@/lib/billing/handleWebhook";
import { mockProvider } from "@/lib/llm/mock";
import type { ChatTurn, LlmProvider } from "@/lib/llm";
import type { Memory } from "@/lib/memory/extract";
import { DEFAULT_COIN_PACKS, DEFAULT_PLANS, type Plan, type Subscription } from "@/lib/plans";

export const USER = "user-1";

export function makeChatDeps(opts: {
  now: Date;
  profile?: Partial<ChatProfile> | null;
  subscription?: Subscription | null;
  llm?: LlmProvider;
  utilityLlm?: LlmProvider;
  memories?: Memory[];
}) {
  const usage = new Map<string, number>();
  const messages: { role: "user" | "assistant"; content: string; flagged?: boolean }[] = [];
  const safety: string[] = [];
  const memories: Memory[] = [...(opts.memories ?? [])];
  const utilityCalls: string[] = [];
  const systems: string[] = [];
  let giftRuns = 0;
  let llmCalls = 0;
  const base = opts.llm ?? mockProvider();
  const llm: LlmProvider = { ...base, stream: (r) => (llmCalls++, systems.push(r.system), base.stream(r)) };
  const utilBase = opts.utilityLlm ?? mockProvider();
  const utilityLlm: LlmProvider = { ...utilBase, complete: (r) => (utilityCalls.push(r.messages[0].content), utilBase.complete(r)) };

  const deps: ChatDeps = {
    now: () => opts.now,
    llm,
    utilityLlm,
    getProfile: async () =>
      opts.profile === null
        ? null
        : { dob: "1995-05-05", blocked: false, language: "en", display_name: "Ada", created_at: "2026-01-01T09:00:00Z", ...opts.profile },
    getCharacter: async () => ({ id: "char-1", name: "Tobi", gender: "male", personality: "caring" }),
    getSubscription: async () => {
      const s = opts.subscription;
      if (!s) return null;
      return { subscription: s, plan: DEFAULT_PLANS.find((p) => p.id === s.plan_id)! };
    },
    consumeMessage: async (u, d, limit) => {
      const k = `${u}:${d}`;
      const used = usage.get(k) ?? 0;
      if (limit <= 0 || used >= limit) return { allowed: false, used };
      usage.set(k, used + 1);
      return { allowed: true, used: used + 1 };
    },
    refundMessage: async (u, d) => {
      const k = `${u}:${d}`;
      usage.set(k, Math.max((usage.get(k) ?? 0) - 1, 0));
    },
    recentMessages: async () => messages.map(({ role, content }) => ({ role, content }) as ChatTurn),
    saveMessage: async (m) => {
      messages.push({ role: m.role, content: m.content, flagged: m.flagged });
      return m.id ?? String(messages.length);
    },
    logSafetyEvent: async (_u, t) => void safety.push(t),
    newId: () => `msg-${messages.length + 1}`,
    getMemories: async () => [...memories],
    saveMemories: async (_u, _c, r) => {
      for (const id of r.replaceIds) memories.splice(memories.findIndex((m) => m.id === id), 1);
      for (const a of r.add) memories.push({ id: `mem-${memories.length + 1}`, ...a, updated_at: opts.now.toISOString() });
    },
    recordUtilityUsage: async () => {},
    recentGifts: async () => [],
    runGifts: async () => void giftRuns++,
  };
  return { deps, usage, messages, safety, memories, utilityCalls, systems, giftRuns: () => giftRuns, llmCalls: () => llmCalls };
}

export async function collect(events: AsyncIterable<ChatEvent>) {
  const out: ChatEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

export function makeWebhookDeps(now: Date, plans: Plan[] = DEFAULT_PLANS) {
  const subs = new Map<string, Subscription>();
  const claimed = new Set<string>();
  const coinRefs = new Set<string>();
  const coins = new Map<string, number>();
  const payments = new Map<string, { userId: string; kind: string; amountKobo: number }>();
  const deps: WebhookDeps = {
    now: () => now,
    getPlanById: async (id) => plans.find((p) => p.id === id) ?? null,
    getPlanByCode: async (code) => plans.find((p) => p.paystack_plan_code === code) ?? null,
    getSubscription: async (u) => subs.get(u) ?? null,
    findUserByCustomerCode: async (c) => [...subs.values()].find((s) => s.paystack_customer_code === c)?.user_id ?? null,
    findUserBySubscriptionCode: async (c) => [...subs.values()].find((s) => s.paystack_subscription_code === c)?.user_id ?? null,
    upsertSubscription: async (s) => void subs.set(s.user_id, s),
    claimEvent: async (k) => (claimed.has(k) ? false : (claimed.add(k), true)),
    releaseEvent: async (k) => void claimed.delete(k),
    getCoinPack: async (id) => DEFAULT_COIN_PACKS.find((p) => p.id === id) ?? null,
    creditCoins: async (u, amount, _reason, ref) => {
      if (coinRefs.has(ref)) return;
      coinRefs.add(ref);
      coins.set(u, (coins.get(u) ?? 0) + amount);
    },
    recordPayment: async (p) => {
      if (!payments.has(p.reference)) payments.set(p.reference, p);
    },
  };
  return { deps, subs, coins, payments };
}
