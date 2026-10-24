import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decimalToKobo, koboToDecimal, verifyBachsSignature } from "@/lib/billing/bachs";
import { applyPayment, handleBachsWebhook, paymentFromBachsCheckout } from "@/lib/billing/handleWebhook";
import { DEFAULT_PLANS, renewalNotice, type Subscription } from "@/lib/plans";
import { makeWebhookDeps, USER } from "./fakes";

const SECRET = "whsec_test";
const NOW = new Date("2026-10-24T12:00:00Z");
const NOW_S = Math.floor(NOW.getTime() / 1000);

const sign = (raw: string, secret = SECRET, t = NOW_S) =>
  `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`;

function send(deps: Parameters<typeof handleBachsWebhook>[0], body: object, header?: string) {
  const raw = JSON.stringify(body);
  return handleBachsWebhook(deps, raw, header ?? sign(raw), SECRET, NOW_S);
}

let n = 0;
const collection = (data: object = {}) => ({
  id: `evt_${++n}`,
  type: "collection.succeeded",
  created_at: NOW.toISOString(),
  data: {
    charge_id: "ch_1",
    checkout_id: "chk_1",
    status: "SUCCEEDED",
    amount: "1500.00",
    currency: "NGN",
    metadata: { user_id: USER, kind: "plan", plan_id: "two_week" },
    ...data,
  },
});

describe("Bachs amounts", () => {
  it("converts between kobo and Bachs decimal strings without float errors", () => {
    expect(koboToDecimal(150_000)).toBe("1500.00");
    expect(koboToDecimal(5)).toBe("0.05");
    expect(decimalToKobo("2500.00")).toBe(250_000);
    expect(decimalToKobo("19.9")).toBe(1_990);
    expect(decimalToKobo("1500")).toBe(150_000);
    expect(decimalToKobo("abc")).toBeNaN();
    expect(() => koboToDecimal(1.5)).toThrow();
  });
});

describe("Bachs signature (X-Bachs-Signature-V2)", () => {
  const raw = '{"hello":"world"}';
  it("accepts a valid signature and rejects tampering, wrong secrets and missing headers", () => {
    expect(verifyBachsSignature(sign(raw), raw, SECRET, NOW_S)).toBe(true);
    expect(verifyBachsSignature(sign(raw), raw + " ", SECRET, NOW_S)).toBe(false);
    expect(verifyBachsSignature(sign(raw, "whsec_other"), raw, SECRET, NOW_S)).toBe(false);
    expect(verifyBachsSignature(null, raw, SECRET, NOW_S)).toBe(false);
    expect(verifyBachsSignature(sign(raw), raw, "", NOW_S)).toBe(false);
  });

  it("rejects replays outside the 5-minute window", () => {
    expect(verifyBachsSignature(sign(raw, SECRET, NOW_S - 301), raw, SECRET, NOW_S)).toBe(false);
    expect(verifyBachsSignature(sign(raw, SECRET, NOW_S - 299), raw, SECRET, NOW_S)).toBe(true);
  });

  it("accepts any v1 value during a secret rotation", () => {
    const old = createHmac("sha256", "whsec_old").update(`${NOW_S}.${raw}`).digest("hex");
    const current = sign(raw).split("v1=")[1];
    expect(verifyBachsSignature(`t=${NOW_S},v1=${old},v1=${current}`, raw, SECRET, NOW_S)).toBe(true);
  });
});

describe("Bachs webhook", () => {
  it("rejects a bad signature with 400 (Bachs doesn't retry 4xx)", async () => {
    const t = makeWebhookDeps(NOW);
    expect(await send(t.deps, collection(), "t=1,v1=nope")).toEqual({ status: 400, reason: "bad_signature" });
    expect(t.subs.size).toBe(0);
  });

  it("activates a 2-week pass and records the payment", async () => {
    const t = makeWebhookDeps(NOW);
    expect(await send(t.deps, collection())).toEqual({ status: 200, reason: "activated" });
    expect(t.subs.get(USER)).toMatchObject({ plan_id: "two_week", status: "active", payment_ref: "chk_1", current_period_end: "2026-11-07T12:00:00.000Z" });
    expect(t.payments.get("chk_1")).toMatchObject({ kind: "plan", amountKobo: 150_000 });
  });

  it("applies a payment once even if the event is redelivered under a new event id", async () => {
    const t = makeWebhookDeps(NOW);
    await send(t.deps, collection());
    expect(await send(t.deps, collection())).toEqual({ status: 200, reason: "duplicate" });
    expect(t.subs.get(USER)?.current_period_end).toBe("2026-11-07T12:00:00.000Z");
  });

  it("sells the monthly plan as a 30-day pass with bonus coins", async () => {
    const t = makeWebhookDeps(NOW);
    await send(t.deps, collection({ checkout_id: "chk_m", amount: "2500.00", metadata: { user_id: USER, kind: "plan", plan_id: "monthly" } }));
    expect(t.subs.get(USER)).toMatchObject({ plan_id: "monthly", current_period_end: "2026-11-23T12:00:00.000Z" });
    expect(t.coins.get(USER)).toBe(150);
  });

  it("credits coin packs", async () => {
    const t = makeWebhookDeps(NOW);
    const r = await send(t.deps, collection({ checkout_id: "chk_c", amount: "1000.00", metadata: { user_id: USER, kind: "coins", pack_id: "coins_250" } }));
    expect(r).toEqual({ status: 200, reason: "coins_credited" });
    expect(t.coins.get(USER)).toBe(250);
  });

  it("refuses underpayment and non-Naira payments", async () => {
    const t = makeWebhookDeps(NOW);
    expect(await send(t.deps, collection({ amount: "15.00" }))).toEqual({ status: 200, reason: "amount_mismatch" });
    expect(await send(t.deps, collection({ checkout_id: "chk_usd", currency: "USD" }))).toEqual({ status: 200, reason: "wrong_currency" });
    expect(t.subs.size).toBe(0);
  });

  it("ignores failed charges, deposits without a checkout, and other event types", async () => {
    const t = makeWebhookDeps(NOW);
    expect(await send(t.deps, collection({ status: "FAILED" }))).toEqual({ status: 200, reason: "not_successful" });
    expect(await send(t.deps, collection({ checkout_id: null }))).toEqual({ status: 200, reason: "no_checkout" });
    expect(await send(t.deps, { ...collection(), type: "checkout.expired" })).toEqual({ status: 200, reason: "ignored" });
    expect(t.subs.size).toBe(0);
  });

  it("treats the callback page and the webhook as the same payment", async () => {
    const t = makeWebhookDeps(NOW);
    const payment = paymentFromBachsCheckout({
      checkout_id: "chk_1",
      status: "completed",
      payment_status: "succeeded",
      amount: "1500.00",
      currency: "NGN",
      reference: "ref",
      metadata: { user_id: USER, kind: "plan", plan_id: "two_week" },
    });
    expect(await applyPayment(t.deps, payment!)).toBe("activated");
    expect(await send(t.deps, collection())).toEqual({ status: 200, reason: "duplicate" });
  });

  it("does not grant anything for an unpaid checkout", () => {
    expect(
      paymentFromBachsCheckout({ checkout_id: "c", status: "open", payment_status: "processing", amount: "1500.00", currency: "NGN", reference: null, metadata: null }),
    ).toBeNull();
  });
});

describe("renewal reminder", () => {
  const twoWeek = DEFAULT_PLANS.find((p) => p.id === "two_week")!;
  const sub = (end: string, status: Subscription["status"] = "active"): Subscription => ({ user_id: USER, plan_id: "two_week", status, current_period_end: end });

  it("warns in the last 3 days of a pass", () => {
    expect(renewalNotice(sub("2026-10-30T12:00:00Z"), twoWeek, NOW)).toBeNull();
    expect(renewalNotice(sub("2026-10-26T18:00:00Z"), twoWeek, NOW)).toEqual({ state: "ending", planName: "2 Weeks", daysLeft: 2 });
    expect(renewalNotice(sub("2026-10-24T20:00:00Z"), twoWeek, NOW)).toMatchObject({ state: "ending", daysLeft: 0 });
  });

  it("nudges for a week after a pass ends, then stops", () => {
    expect(renewalNotice(sub("2026-10-22T12:00:00Z"), twoWeek, NOW)).toMatchObject({ state: "ended" });
    expect(renewalNotice(sub("2026-10-10T12:00:00Z"), twoWeek, NOW)).toBeNull();
  });

  it("never shows for auto-renewing plans or users without a plan", () => {
    expect(renewalNotice(sub("2026-10-25T12:00:00Z"), { ...twoWeek, billing: "recurring" }, NOW)).toBeNull();
    expect(renewalNotice(null, null, NOW)).toBeNull();
  });
});
