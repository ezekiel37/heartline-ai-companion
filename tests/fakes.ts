import type { ChatDeps, ChatEvent, ChatProfile } from "@/lib/chat/handleChat";
import type { WebhookDeps } from "@/lib/billing/handleWebhook";
import { mockProvider } from "@/lib/llm/mock";
import type { ChatTurn, LlmProvider } from "@/lib/llm";
import { DEFAULT_PLANS, type Plan, type Subscription } from "@/lib/plans";

export const USER = "user-1";

export function makeChatDeps(opts: {
  now: Date;
  profile?: Partial<ChatProfile> | null;
  subscription?: Subscription | null;
  llm?: LlmProvider;
}) {
  const usage = new Map<string, number>();
  const messages: { role: "user" | "assistant"; content: string; flagged?: boolean }[] = [];
  const safety: string[] = [];
  let llmCalls = 0;
  const base = opts.llm ?? mockProvider();
  const llm: LlmProvider = { ...base, stream: (r) => (llmCalls++, base.stream(r)) };

  const deps: ChatDeps = {
    now: () => opts.now,
    llm,
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
  };
  return { deps, usage, messages, safety, llmCalls: () => llmCalls };
}

export async function collect(events: AsyncIterable<ChatEvent>) {
  const out: ChatEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

export function makeWebhookDeps(now: Date, plans: Plan[] = DEFAULT_PLANS) {
  const subs = new Map<string, Subscription>();
  const claimed = new Set<string>();
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
  };
  return { deps, subs };
}
