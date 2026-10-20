import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { handlePaystackWebhook } from "@/lib/billing/handleWebhook";
import { DEFAULT_PLANS } from "@/lib/plans";
import { makeWebhookDeps, USER } from "./fakes";

const SECRET = "sk_test_secret";
const NOW = new Date("2026-10-20T12:00:00Z");
const PLANS = DEFAULT_PLANS.map((p) => (p.id === "monthly" ? { ...p, paystack_plan_code: "PLN_monthly" } : p));

function send(deps: Parameters<typeof handlePaystackWebhook>[0], body: object, secret = SECRET) {
  const raw = JSON.stringify(body);
  const sig = createHmac("sha512", secret).update(raw).digest("hex");
  return handlePaystackWebhook(deps, raw, sig, SECRET);
}

const charge = (over: object = {}) => ({
  event: "charge.success",
  data: {
    reference: "ref_1",
    status: "success",
    amount: 150_000,
    currency: "NGN",
    metadata: { user_id: USER, plan_id: "two_week" },
    customer: { customer_code: "CUS_1" },
    ...over,
  },
});

describe("Paystack webhook", () => {
  it("rejects requests with a bad signature", async () => {
    const { deps, subs } = makeWebhookDeps(NOW, PLANS);
    expect(await send(deps, charge(), "wrong")).toEqual({ status: 401, reason: "bad_signature" });
    expect(subs.size).toBe(0);
  });

  it("activates a 2-week pass on charge.success", async () => {
    const { deps, subs } = makeWebhookDeps(NOW, PLANS);
    expect(await send(deps, charge())).toEqual({ status: 200, reason: "activated" });
    expect(subs.get(USER)).toMatchObject({ plan_id: "two_week", status: "active", current_period_end: "2026-11-03T12:00:00.000Z" });
  });

  it("is idempotent: a replayed charge does not extend access twice", async () => {
    const { deps, subs } = makeWebhookDeps(NOW, PLANS);
    await send(deps, charge());
    expect(await send(deps, charge())).toEqual({ status: 200, reason: "duplicate" });
    expect(subs.get(USER)?.current_period_end).toBe("2026-11-03T12:00:00.000Z");
  });

  it("stacks a second pass on top of remaining time", async () => {
    const { deps, subs } = makeWebhookDeps(NOW, PLANS);
    await send(deps, charge());
    await send(deps, charge({ reference: "ref_2" }));
    expect(subs.get(USER)?.current_period_end).toBe("2026-11-17T12:00:00.000Z");
  });

  it("refuses an underpaid charge", async () => {
    const { deps, subs } = makeWebhookDeps(NOW, PLANS);
    expect(await send(deps, charge({ amount: 100 }))).toEqual({ status: 200, reason: "amount_mismatch" });
    expect(subs.size).toBe(0);
  });

  it("handles the monthly subscription lifecycle: create → renew → payment failed → cancelled", async () => {
    const { deps, subs } = makeWebhookDeps(NOW, PLANS);
    await send(deps, charge({ reference: "m1", amount: 250_000, metadata: { user_id: USER, plan_id: "monthly" }, plan: { plan_code: "PLN_monthly" } }));
    expect(subs.get(USER)).toMatchObject({ plan_id: "monthly", status: "active" });

    await send(deps, {
      event: "subscription.create",
      data: { subscription_code: "SUB_1", email_token: "tok", next_payment_date: "2026-11-19T12:00:00.000Z", customer: { customer_code: "CUS_1" }, plan: { plan_code: "PLN_monthly" } },
    });
    expect(subs.get(USER)).toMatchObject({ paystack_subscription_code: "SUB_1", current_period_end: "2026-11-19T12:00:00.000Z" });

    // Renewal arrives without our metadata; matched by customer + plan code.
    expect(await send(deps, charge({ reference: "m2", amount: 250_000, metadata: null, plan: { plan_code: "PLN_monthly" } }))).toEqual({ status: 200, reason: "activated" });
    expect(subs.get(USER)?.current_period_end).toBe("2026-12-19T12:00:00.000Z");

    await send(deps, { event: "invoice.payment_failed", data: { subscription: { subscription_code: "SUB_1" } } });
    expect(subs.get(USER)?.status).toBe("past_due");

    await send(deps, { event: "subscription.disable", data: { subscription_code: "SUB_1" } });
    expect(subs.get(USER)?.status).toBe("cancelled");
  });

  it("ignores unrelated events", async () => {
    const { deps } = makeWebhookDeps(NOW, PLANS);
    expect(await send(deps, { event: "transfer.success", data: {} })).toEqual({ status: 200, reason: "ignored" });
  });
});
