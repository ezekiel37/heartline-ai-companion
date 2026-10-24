import type { CoinPack, Plan, Subscription, SubscriptionStatus } from "../plans";
import { decimalToKobo, verifyBachsSignature, type BachsCheckout, type BachsEvent } from "./bachs";
import { verifySignature, type PaystackCharge, type PaystackEvent } from "./paystack";

// Turns payment-provider events into `subscriptions` rows. Pure apart from
// `deps`, so it is unit-tested with in-memory fakes. Provider-specific parsing
// lives in handlePaystackWebhook and handleBachsWebhook; both feed applyPayment.
//
// Two plan kinds:
//  - pass:      one-off charge; each payment extends access by the plan's
//               duration. All plans on Bachs, which can't bill NGN recurringly.
//  - recurring: Paystack subscription. Renewals arrive as charge.success with
//               a plan; failures as invoice.payment_failed.

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
  // Undo a claim when applying the event failed, so the provider's retry can succeed.
  releaseEvent(key: string): Promise<void>;
  getCoinPack(id: string): Promise<CoinPack | null>;
  // Idempotent on `ref`.
  creditCoins(userId: string, amount: number, reason: string, ref: string): Promise<void>;
  // Idempotent on `reference`.
  recordPayment(p: { userId: string; reference: string; kind: "plan" | "coins"; itemId: string; amountKobo: number }): Promise<void>;
}

export type WebhookOutcome =
  | { status: 400 | 401; reason: "bad_signature" }
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

// Bachs: only collection.succeeded matters. Each checkout is one purchase,
// so the checkout id is the payment reference. Bachs retries only 5xx/408/429,
// so a bad signature gets 400 and everything we choose to ignore gets 200.
const BACHS_PAID = new Set(["SUCCEEDED", "OVERPAID", "ACCEPTED"]);

export async function handleBachsWebhook(
  deps: WebhookDeps,
  rawBody: string,
  signatureV2: string | null,
  secret: string,
  nowSeconds?: number,
): Promise<WebhookOutcome> {
  if (!verifyBachsSignature(signatureV2, rawBody, secret, nowSeconds)) return { status: 400, reason: "bad_signature" };

  let evt: BachsEvent;
  try {
    evt = JSON.parse(rawBody);
  } catch {
    return { status: 400, reason: "bad_payload" };
  }
  if (!evt?.type || !evt.data) return { status: 400, reason: "bad_payload" };
  if (evt.type !== "collection.succeeded") return { status: 200, reason: "ignored" };

  const d = evt.data as {
    checkout_id?: string | null;
    status?: string;
    amount?: string;
    currency?: string;
    metadata?: ChargeMetadata | null;
  };
  // Deposits without a checkout (e.g. virtual accounts) aren't ours to fulfil.
  if (!d.checkout_id) return { status: 200, reason: "no_checkout" };
  if (!d.status || !BACHS_PAID.has(d.status)) return { status: 200, reason: "not_successful" };

  const amountKobo = decimalToKobo(d.amount ?? "");
  if (!Number.isFinite(amountKobo)) return { status: 400, reason: "bad_payload" };
  return {
    status: 200,
    reason: await applyPayment(deps, {
      reference: d.checkout_id,
      amountKobo,
      currency: d.currency ?? "",
      metadata: d.metadata ?? {},
    }),
  };
}

// For the billing callback page, which reads the checkout from Bachs directly.
export function paymentFromBachsCheckout(c: BachsCheckout): SuccessfulPayment | null {
  if (c.status !== "completed" || c.payment_status !== "succeeded") return null;
  const amountKobo = decimalToKobo(c.amount);
  if (!Number.isFinite(amountKobo)) return null;
  return { reference: c.checkout_id, amountKobo, currency: c.currency, metadata: (c.metadata ?? {}) as ChargeMetadata };
}

export interface ChargeMetadata {
  user_id?: string;
  plan_id?: string;
  kind?: "plan" | "coins";
  pack_id?: string;
}

// A successful one-time payment, in a shape every provider can be mapped to.
export interface SuccessfulPayment {
  reference: string; // provider's unique id for this payment: idempotency key and record
  amountKobo: number;
  currency: string;
  metadata: ChargeMetadata; // set by our server when the checkout was created
  customerCode?: string | null; // Paystack: links renewals to a user
  planCode?: string | null; // Paystack: identifies the plan on renewals
}

function metadataOf(charge: PaystackCharge): ChargeMetadata {
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

// Paystack charge (webhook or transaction verify) → applyPayment.
export async function applyCharge(deps: WebhookDeps, charge: PaystackCharge): Promise<string> {
  if (charge.status !== "success") return "not_successful";
  return applyPayment(deps, {
    reference: charge.reference,
    amountKobo: charge.amount,
    currency: charge.currency,
    metadata: metadataOf(charge),
    customerCode: charge.customer?.customer_code ?? null,
    planCode: typeof charge.plan === "object" ? (charge.plan?.plan_code ?? null) : null,
  });
}

// Grants what was paid for. Shared by every provider's webhook and by the
// billing callback page (which verifies with the provider directly so access
// starts even if the webhook is delayed). Safe to call twice for one payment.
export async function applyPayment(deps: WebhookDeps, p: SuccessfulPayment): Promise<string> {
  if (p.currency !== "NGN") return "wrong_currency";
  const meta = p.metadata;
  if (meta.kind === "coins") return applyCoinPayment(deps, p);

  let plan = meta.plan_id ? await deps.getPlanById(meta.plan_id) : null;
  if (!plan && p.planCode) plan = await deps.getPlanByCode(p.planCode);
  if (!plan) return "unknown_plan";
  if (p.amountKobo < plan.price_kobo) return "amount_mismatch";

  let userId = meta.user_id ?? null;
  if (!userId && p.customerCode) userId = await deps.findUserByCustomerCode(p.customerCode);
  if (!userId) return "unknown_user";

  const key = `charge:${p.reference}`;
  if (!(await deps.claimEvent(key, "payment.succeeded"))) return "duplicate";

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
      payment_ref: p.reference,
      paystack_customer_code: p.customerCode ?? existing?.paystack_customer_code ?? null,
    });
    await deps.recordPayment({ userId, reference: p.reference, kind: "plan", itemId: plan.id, amountKobo: p.amountKobo });
    if (plan.bonus_coins) {
      await deps.creditCoins(userId, plan.bonus_coins, `plan_bonus:${plan.id}`, `bonus:${p.reference}`);
    }
  } catch (e) {
    await deps.releaseEvent(key);
    throw e;
  }
  return "activated";
}

async function applyCoinPayment(deps: WebhookDeps, p: SuccessfulPayment): Promise<string> {
  const meta = p.metadata;
  if (!meta.user_id || !meta.pack_id) return "bad_metadata";
  const pack = await deps.getCoinPack(meta.pack_id);
  if (!pack) return "unknown_pack";
  if (p.amountKobo < pack.price_kobo) return "amount_mismatch";

  const key = `charge:${p.reference}`;
  if (!(await deps.claimEvent(key, "payment.succeeded"))) return "duplicate";
  try {
    await deps.creditCoins(meta.user_id, pack.coins, `pack:${pack.id}`, `pack:${p.reference}`);
    await deps.recordPayment({ userId: meta.user_id, reference: p.reference, kind: "coins", itemId: pack.id, amountKobo: p.amountKobo });
  } catch (e) {
    await deps.releaseEvent(key);
    throw e;
  }
  return "coins_credited";
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
