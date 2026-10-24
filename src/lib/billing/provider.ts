import { randomUUID } from "node:crypto";
import { createBachsCheckout } from "./bachs";
import { initializeTransaction } from "./paystack";

// Which gateway takes payments. Bachs is the default; Paystack stays available
// (and is the only one that can auto-renew NGN plans today).
export type PaymentProvider = "bachs" | "paystack";

export function paymentProvider(): PaymentProvider {
  return process.env.PAYMENT_PROVIDER === "paystack" ? "paystack" : "bachs";
}

export const PROVIDER_LABEL: Record<PaymentProvider, string> = { bachs: "Bachs", paystack: "Paystack" };

export interface CheckoutRequest {
  email: string;
  amountKobo: number;
  metadata: Record<string, string>;
  callbackUrl: string;
  cancelUrl: string;
  // Paystack only: a plan code turns the payment into a recurring subscription.
  paystackPlanCode?: string | null;
}

// Returns the hosted checkout URL to send the customer to.
export async function startCheckout(req: CheckoutRequest): Promise<string> {
  if (paymentProvider() === "paystack") {
    const tx = await initializeTransaction({
      email: req.email,
      amountKobo: req.amountKobo,
      planCode: req.paystackPlanCode ?? null,
      callbackUrl: req.callbackUrl,
      metadata: req.metadata,
    });
    return tx.authorization_url;
  }
  const checkout = await createBachsCheckout({
    reference: randomUUID(),
    amountKobo: req.amountKobo,
    email: req.email,
    metadata: req.metadata,
    successUrl: req.callbackUrl,
    cancelUrl: req.cancelUrl,
  });
  return checkout.checkout_url;
}
