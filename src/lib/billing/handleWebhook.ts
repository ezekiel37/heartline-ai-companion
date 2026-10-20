import type { Plan, Subscription, SubscriptionStatus } from "../plans";
import { verifySignature, type PaystackCharge, type PaystackEvent } from "./paystack";

// Turns Paystack events into `subscriptions` rows. Pure apart from `deps`, so
// it is unit-tested with in-memory fakes.
//
// Two plan kinds:
//  - pass:      one-off charge (e.g. 2 weeks). Paystack has no 2-week interval,
//               so this plan never auto-renews; each charge extends access.
//  - recurring: Paystack subscription (e.g. monthly). Renewals arrive as
//               charge.success with a plan; failures as invoice.payment_failed.

export interface WebhookDeps {
  now(): Date;
  getPlanById(id: string): Promise<Plan | null>;
  getPlanByCode(code: string): Promise<Plan | null>;
  getSubscription(userId: string): Promise<Subscription | null>;
  findUserByCustomerCode(code: string): Promise<string | null>;
  findUserBySubscriptionCode(code: string): Promise<string | null>;
  upsertSubscription(sub: Subscription): Promise<void>;
  // Returns false if this key was already processed (idempotency).
  claimEvent(key: string, event: string): Promise<boolean>;
  // Undo a claim when applying the event failed, so Paystack's retry can succeed.
  releaseEvent(key: string): Promise<void>;
}

export type WebhookOutcome =
  | { status: 401; reason: "bad_signature" }
  | { status: 400; reason: "bad_payload" }
  | { status: 200; reason: string };

const DAY_MS = 86_400_000;

export async function handlePaystackWebhook(
  deps: WebhookDeps,
  rawBody: string,
  signature: string | null,
  secretKey: string,
): Promise<WebhookOutcome> {
  if (!verifySignature(rawBody, signature, secretKey)) return { status: 401, reason: "bad_signature" };

  let evt: PaystackEvent;
  try {
    evt = JSON.parse(rawBody);
  } catch {
    return { status: 400, reason: "bad_payload" };
  }
  if (!evt?.event || !evt.data) return { status: 400, reason: "bad_payload" };

  switch (evt.event) {
    case "charge.success":
      return { status: 200, reason: await applyCharge(deps, evt.data as unknown as PaystackCharge) };
    case "subscription.create":
      return { status: 200, reason: await applySubscriptionCreate(deps, evt.data) };
    case "invoice.payment_failed":
      return { status: 200, reason: await setStatusBySubscription(deps, evt.data, "past_due") };
    case "subscription.not_renew":
    case "subscription.disable":
      return { status: 200, reason: await setStatusBySubscription(deps, evt.data, "cancelled") };
    default:
      return { status: 200, reason: "ignored" };
  }
}

function metadataOf(charge: PaystackCharge): { user_id?: string; plan_id?: string } {
  if (!charge.metadata) return {};
  if (typeof charge.metadata === "string") {
    try {
      return JSON.parse(charge.metadata);
    } catch {
      return {};
    }
  }
  return charge.metadata;
}

// Shared by the webhook and the billing callback page (which verifies the
// transaction directly so access is granted even if the webhook is delayed).
export async function applyCharge(deps: WebhookDeps, charge: PaystackCharge): Promise<string> {
  if (charge.status !== "success") return "not_successful";
  if (charge.currency !== "NGN") return "wrong_currency";

  const meta = metadataOf(charge);
  const planCode = typeof charge.plan === "object" ? charge.plan?.plan_code : undefined;

  let plan = meta.plan_id ? await deps.getPlanById(meta.plan_id) : null;
  if (!plan && planCode) plan = await deps.getPlanByCode(planCode);
  if (!plan) return "unknown_plan";
  if (charge.amount < plan.price_kobo) return "amount_mismatch";

  let userId = meta.user_id ?? null;
  if (!userId && charge.customer?.customer_code) {
    userId = await deps.findUserByCustomerCode(charge.customer.customer_code);
  }
  if (!userId) return "unknown_user";

  const key = `charge:${charge.reference}`;
  if (!(await deps.claimEvent(key, "charge.success"))) return "duplicate";

  const now = deps.now();
  const existing = await deps.getSubscription(userId);
  const currentEnd = existing?.current_period_end ? new Date(existing.current_period_end).getTime() : 0;
  const start = Math.max(currentEnd, now.getTime());
  const periodEnd = new Date(start + plan.duration_days * DAY_MS).toISOString();

  try {
    await deps.upsertSubscription({
      ...existing,
      user_id: userId,
      plan_id: plan.id,
      status: "active",
      current_period_end: periodEnd,
      paystack_ref: charge.reference,
      paystack_customer_code: charge.customer?.customer_code ?? existing?.paystack_customer_code ?? null,
    });
  } catch (e) {
    await deps.releaseEvent(key);
    throw e;
  }
  return "activated";
}

async function applySubscriptionCreate(deps: WebhookDeps, data: Record<string, unknown>): Promise<string> {
  const customer = data.customer as { customer_code?: string } | undefined;
  const plan = data.plan as { plan_code?: string } | undefined;
  const code = data.subscription_code as string | undefined;
  if (!customer?.customer_code || !code) return "bad_payload";

  const userId = await deps.findUserByCustomerCode(customer.customer_code);
  if (!userId) return "unknown_user";
  const existing = await deps.getSubscription(userId);
  const p = plan?.plan_code ? await deps.getPlanByCode(plan.plan_code) : null;
  const next = data.next_payment_date as string | undefined;

  await deps.upsertSubscription({
    ...(existing ?? { status: "active", current_period_end: null }),
    user_id: userId,
    plan_id: p?.id ?? existing?.plan_id ?? "monthly",
    status: "active",
    current_period_end: next ?? existing?.current_period_end ?? null,
    paystack_customer_code: customer.customer_code,
    paystack_subscription_code: code,
    paystack_email_token: (data.email_token as string | undefined) ?? existing?.paystack_email_token ?? null,
  });
  return "subscription_linked";
}

async function setStatusBySubscription(
  deps: WebhookDeps,
  data: Record<string, unknown>,
  status: SubscriptionStatus,
): Promise<string> {
  const nested = data.subscription as { subscription_code?: string } | undefined;
  const code = (data.subscription_code as string | undefined) ?? nested?.subscription_code;
  if (!code) return "bad_payload";
  const userId = await deps.findUserBySubscriptionCode(code);
  if (!userId) return "unknown_user";
  const existing = await deps.getSubscription(userId);
  if (!existing) return "unknown_subscription";
  await deps.upsertSubscription({ ...existing, status });
  return `status_${status}`;
}
