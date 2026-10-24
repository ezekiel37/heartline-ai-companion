import { createHmac, timingSafeEqual } from "node:crypto";

// Bachs (https://docs.bachs.io) client: hosted checkout for one-time NGN
// payments by card or bank transfer. Bachs money is a decimal string
// ("1500.00"), never minor units; we store kobo, so convert at the edge.
// Bachs can't bill NGN subscriptions yet (USD cards only), so every plan is
// sold as a pass on this provider.

function config() {
  const url = process.env.BACHS_API_URL || "https://sandbox-api.bachs.io";
  const key = process.env.BACHS_API_KEY;
  if (!key) throw new Error("BACHS_API_KEY is not set");
  return { url, key };
}

export function koboToDecimal(kobo: number): string {
  if (!Number.isInteger(kobo) || kobo < 0) throw new Error(`Invalid kobo amount: ${kobo}`);
  return `${Math.floor(kobo / 100)}.${String(kobo % 100).padStart(2, "0")}`;
}

// "1500.00" → 150000. String-based so no floating-point rounding.
export function decimalToKobo(amount: string): number {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!m) return NaN;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

// X-Bachs-Signature-V2: "t=<unix seconds>,v1=<hex>[,v1=<hex>…]", where each v1
// is HMAC-SHA256 of "<t>.<raw body>". Several v1 values appear while a secret
// is being rotated; any match is valid.
export function verifyBachsSignature(
  header: string | null,
  rawBody: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): boolean {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => {
    const i = p.indexOf("=");
    return [p.slice(0, i).trim(), p.slice(i + 1).trim()] as const;
  });
  const timestamp = Number(parts.find(([k]) => k === "t")?.[1]);
  if (!timestamp || Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  return parts
    .filter(([k]) => k === "v1")
    .some(([, sig]) => sig.length === expected.length && timingSafeEqual(Buffer.from(sig), a));
}

async function call<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  const { url, key } = config();
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Bachs ${path} failed (${res.status}): ${body?.error_code ?? body?.message ?? "unknown"}`);
  return body as T;
}

export interface BachsCheckoutInput {
  reference: string; // our id for this purchase; unique per account
  amountKobo: number;
  email: string;
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
}

export function createBachsCheckout(input: BachsCheckoutInput) {
  return call<{ checkout_id: string; checkout_url: string; status: string; expires_at: string }>("/v1/checkout-sessions", {
    method: "POST",
    idempotencyKey: `checkout-${input.reference}`,
    body: JSON.stringify({
      // Raw-amount checkout: no catalog products to keep in sync with our plans table.
      pricing: { currency: "NGN", amount: koboToDecimal(input.amountKobo) },
      // Naira only: Nigerian cards and bank transfer, no FX surprises.
      payment_method_types: ["NGN_CARD", "NGN_BANK_TRANSFER"],
      customer: { email: input.email },
      reference: input.reference,
      metadata: input.metadata,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      expires_in_minutes: 60,
    }),
  });
}

export interface BachsCheckout {
  checkout_id: string;
  status: "open" | "completed" | "expired" | "cancelled";
  payment_status: string | null;
  amount: string;
  currency: string;
  reference: string | null;
  metadata: Record<string, string> | null;
}

export function getBachsCheckout(checkoutId: string) {
  return call<BachsCheckout>(`/v1/checkout-sessions/${encodeURIComponent(checkoutId)}`);
}

export interface BachsEvent {
  id: string;
  type: string;
  created_at: string;
  data: Record<string, unknown>;
}
