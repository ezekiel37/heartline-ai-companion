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
  features: string[];
  active: boolean;
  sort: number;
}

export interface Subscription {
  user_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  current_period_end: string | null;
  paystack_ref?: string | null;
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
    features: ["chat", "memory", "avatar_studio", "wardrobe", "gifts", "bonus_coins"],
    active: true,
    sort: 2,
  },
];

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
