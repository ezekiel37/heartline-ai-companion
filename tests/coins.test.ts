import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { handlePaystackWebhook } from "@/lib/billing/handleWebhook";
import { DEFAULT_PLANS } from "@/lib/plans";
import { makeWebhookDeps, USER } from "./fakes";

const SECRET = "sk_test_secret";
const NOW = new Date("2026-10-20T12:00:00Z");

function send(deps: Parameters<typeof handlePaystackWebhook>[0], body: object) {
  const raw = JSON.stringify(body);
  return handlePaystackWebhook(deps, raw, createHmac("sha512", SECRET).update(raw).digest("hex"), SECRET);
}

const coinCharge = (over: object = {}) => ({
  event: "charge.success",
  data: {
    reference: "c1",
    status: "success",
    amount: 100_000,
    currency: "NGN",
    metadata: { user_id: USER, kind: "coins", pack_id: "coins_250" },
    ...over,
  },
});

describe("coin purchases", () => {
  it("credits a coin pack once and records the payment", async () => {
    const t = makeWebhookDeps(NOW);
    expect(await send(t.deps, coinCharge())).toEqual({ status: 200, reason: "coins_credited" });
    expect(await send(t.deps, coinCharge())).toEqual({ status: 200, reason: "duplicate" });
    expect(t.coins.get(USER)).toBe(250);
    expect(t.payments.get("c1")).toMatchObject({ kind: "coins", amountKobo: 100_000 });
    expect(t.subs.size).toBe(0); // buying coins doesn't grant a plan
  });

  it("refuses underpaid or unknown packs", async () => {
    const t = makeWebhookDeps(NOW);
    expect(await send(t.deps, coinCharge({ amount: 500 }))).toEqual({ status: 200, reason: "amount_mismatch" });
    expect(await send(t.deps, coinCharge({ reference: "c2", metadata: { user_id: USER, kind: "coins", pack_id: "nope" } }))).toEqual({
      status: 200,
      reason: "unknown_pack",
    });
    expect(t.coins.size).toBe(0);
  });

  it("credits monthly bonus coins on every plan charge, once per charge", async () => {
    const plans = DEFAULT_PLANS.map((p) => (p.id === "monthly" ? { ...p, paystack_plan_code: "PLN_m" } : p));
    const t = makeWebhookDeps(NOW, plans);
    const charge = (ref: string) => ({
      event: "charge.success",
      data: { reference: ref, status: "success", amount: 250_000, currency: "NGN", metadata: { user_id: USER, plan_id: "monthly" }, customer: { customer_code: "CUS" } },
    });
    await send(t.deps, charge("m1"));
    await send(t.deps, charge("m1"));
    await send(t.deps, charge("m2"));
    expect(t.coins.get(USER)).toBe(300);
    expect([...t.payments.keys()]).toEqual(["m1", "m2"]);
  });

  it("gives no bonus coins on the 2-week pass", async () => {
    const t = makeWebhookDeps(NOW);
    await send(t.deps, {
      event: "charge.success",
      data: { reference: "p1", status: "success", amount: 150_000, currency: "NGN", metadata: { user_id: USER, plan_id: "two_week" } },
    });
    expect(t.coins.get(USER)).toBeUndefined();
    expect(t.payments.get("p1")).toMatchObject({ kind: "plan" });
  });
});
