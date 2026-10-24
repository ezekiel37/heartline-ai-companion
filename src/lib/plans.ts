// Plan and allowance rules. Prices/caps live in the `plans` table; the values
// here are the seed defaults and the free-tier policy, kept in one place so the
// chat route and tests agree.

export type BillingType = "pass" | "recurring";
export type SubscriptionStatus = "active" | "past_due" | "cancelled";

export interface Plan {
  id: string;
  name: string;
  price_kobo: number;
  duration_days: number;
  billing: BillingType;
  paystack_plan_code: string | null;
  daily_message_cap: number;
  bonus_coins?: number; // credited on every successful charge
  features: string[];
  active: boolean;
  sort: number;
}

export interface Subscription {
  user_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  current_period_end: string | null;
  payment_ref?: string | null;
  paystack_customer_code?: string | null;
  paystack_subscription_code?: string | null;
  paystack_email_token?: string | null;
}

// Free tier: a generous first day (so the user experiences the product),
// then a small daily allowance that keeps them coming back without
// costing much. Both are enforced server-side in the chat route.
export const FREE_FIRST_DAY_MESSAGES = 10;
export const FREE_DAILY_MESSAGES = 3;

export const DEFAULT_PLANS: Plan[] = [
  {
    id: "two_week",
    name: "2 Weeks",
    price_kobo: 150_000,
    duration_days: 14,
    billing: "pass",
    paystack_plan_code: null,
    daily_message_cap: 60,
    features: ["chat", "memory", "avatar_studio", "wardrobe", "gifts"],
    active: true,
    sort: 1,
  },
  {
    id: "monthly",
    name: "Monthly",
    price_kobo: 250_000,
    duration_days: 30,
    billing: "recurring",
    paystack_plan_code: null, // set from PAYSTACK_PLAN_MONTHLY / plans table
    daily_message_cap: 100,
    bonus_coins: 150,
    features: ["chat", "memory", "avatar_studio", "wardrobe", "gifts", "bonus_coins"],
    active: true,
    sort: 2,
  },
];

export interface CoinPack {
  id: string;
  name: string;
  coins: number;
  price_kobo: number;
  active: boolean;
  sort: number;
}

export const DEFAULT_COIN_PACKS: CoinPack[] = [
  { id: "coins_100", name: "100 coins", coins: 100, price_kobo: 50_000, active: true, sort: 1 },
  { id: "coins_250", name: "250 coins", coins: 250, price_kobo: 100_000, active: true, sort: 2 },
  { id: "coins_700", name: "700 coins", coins: 700, price_kobo: 250_000, active: true, sort: 3 },
];

// Spending guardrail: companion apps attract emotionally attached users, so
// cap coin purchases per day. Plans are not affected.
export const MAX_COIN_SPEND_KOBO_PER_DAY = 1_000_000; // ₦10,000

export function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export function hasActiveAccess(sub: Subscription | null, now: Date): boolean {
  if (!sub || !sub.current_period_end) return false;
  if (sub.status === "past_due") return false;
  // A cancelled subscription keeps access until the period the user paid for ends.
  return new Date(sub.current_period_end).getTime() > now.getTime();
}

export interface Allowance {
  tier: "free" | "paid";
  limit: number;
}

export function dailyAllowance(args: {
  subscription: Subscription | null;
  plan: Plan | null;
  accountCreatedDate: string; // YYYY-MM-DD in app timezone
  today: string; // YYYY-MM-DD in app timezone
  now: Date;
}): Allowance {
  if (args.plan && hasActiveAccess(args.subscription, args.now)) {
    return { tier: "paid", limit: args.plan.daily_message_cap };
  }
  const firstDay = args.accountCreatedDate === args.today;
  return { tier: "free", limit: firstDay ? FREE_FIRST_DAY_MESSAGES : FREE_DAILY_MESSAGES };
}
