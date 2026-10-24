import Link from "next/link";
import { redirect } from "next/navigation";
import { getBachsCheckout } from "@/lib/billing/bachs";
import { applyCharge, applyPayment, paymentFromBachsCheckout } from "@/lib/billing/handleWebhook";
import { verifyTransaction } from "@/lib/billing/paystack";
import { webhookDeps } from "@/lib/deps";
import { requireUser, supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const GRANTED = new Set(["activated", "coins_credited", "duplicate"]);

// The payment provider redirects here after checkout: Bachs with
// ?checkout_id=, Paystack with ?reference=. We look the payment up with the
// provider directly (never trusting the query string) so access starts at
// once; the webhook applies the same payment idempotently.
export default async function BillingCallback({
  searchParams,
}: {
  searchParams: Promise<{ checkout_id?: string; reference?: string }>;
}) {
  const { user } = await requireUser();
  if (!user) redirect("/login");
  const { checkout_id: checkoutId, reference } = await searchParams;
  const deps = webhookDeps(supabaseAdmin());

  let result: string | null = null;
  try {
    if (checkoutId) {
      const payment = paymentFromBachsCheckout(await getBachsCheckout(checkoutId));
      if (payment && payment.metadata.user_id === user.id) result = await applyPayment(deps, payment);
    } else if (reference) {
      const charge = await verifyTransaction(reference);
      const meta = typeof charge.metadata === "object" ? charge.metadata : null;
      if (meta?.user_id === user.id) result = await applyCharge(deps, charge);
    }
  } catch (e) {
    console.error("billing callback verify failed", e);
  }
  const ok = result !== null && GRANTED.has(result);
  const ref = checkoutId ?? reference;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 text-center">
      {ok ? (
        <>
          <h1 className="text-2xl font-bold">You&apos;re all set 💛</h1>
          <p className="text-muted">Your payment went through. Enjoy!</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold">We&apos;re confirming your payment</h1>
          <p className="text-muted">
            Bank transfers can take a few minutes. If you were charged, your purchase will activate automatically. If it
            doesn&apos;t within 30 minutes, contact support with your payment reference{ref ? `: ${ref}` : "."}
          </p>
        </>
      )}
      <Link href="/chat" className="btn mx-auto">
        Back to chat
      </Link>
    </main>
  );
}
