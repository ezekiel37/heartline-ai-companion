import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.paystack.co";

function secret(): string {
  const s = process.env.PAYSTACK_SECRET_KEY;
  if (!s) throw new Error("PAYSTACK_SECRET_KEY is not set");
  return s;
}

// Paystack signs the raw request body with HMAC-SHA512 using your secret key.
export function verifySignature(rawBody: string, signature: string | null, key: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha512", key).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = await res.json();
  if (!res.ok || body.status === false) {
    throw new Error(`Paystack ${path} failed: ${body.message ?? res.status}`);
  }
  return body.data as T;
}

export function initializeTransaction(args: {
  email: string;
  amountKobo: number;
  planCode?: string | null;
  callbackUrl: string;
  metadata: Record<string, string>;
}) {
  return call<{ authorization_url: string; reference: string }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: args.email,
      amount: args.amountKobo,
      currency: "NGN",
      callback_url: args.callbackUrl,
      metadata: args.metadata,
      // Passing a plan makes Paystack create a recurring subscription after the first charge.
      ...(args.planCode ? { plan: args.planCode } : {}),
    }),
  });
}

export function verifyTransaction(reference: string) {
  return call<PaystackCharge>(`/transaction/verify/${encodeURIComponent(reference)}`);
}

export function disableSubscription(code: string, token: string) {
  return call("/subscription/disable", { method: "POST", body: JSON.stringify({ code, token }) });
}

export interface PaystackCharge {
  reference: string;
  status: string;
  amount: number;
  currency: string;
  metadata?: { user_id?: string; plan_id?: string } | string | null;
  customer?: { customer_code?: string; email?: string };
  plan?: { plan_code?: string } | string | null;
}

export interface PaystackEvent {
  event: string;
  data: Record<string, unknown>;
}
