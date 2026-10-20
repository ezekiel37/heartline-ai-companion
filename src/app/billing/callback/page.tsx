import Link from "next/link";
import { redirect } from "next/navigation";
import { applyCharge } from "@/lib/billing/handleWebhook";
import { verifyTransaction } from "@/lib/billing/paystack";
import { webhookDeps } from "@/lib/deps";
import { requireUser, supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Paystack redirects here after checkout. We verify the transaction with
// Paystack directly (never trusting the query string) so access starts
// immediately; the webhook applies the same charge idempotently.
export default async function BillingCallback({ searchParams }: { searchParams: Promise<{ reference?: string }> }) {
  const { user } = await requireUser();
  if (!user) redirect("/login");
  const { reference } = await searchParams;

  let ok = false;
  if (reference) {
    try {
      const charge = await verifyTransaction(reference);
      const meta = typeof charge.metadata === "object" ? charge.metadata : null;
      if (meta?.user_id === user.id) {
        const result = await applyCharge(webhookDeps(supabaseAdmin()), charge);
        ok = result === "activated" || result === "duplicate";
      }
    } catch (e) {
      console.error("billing callback verify failed", e);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 text-center">
      {ok ? (
        <>
          <h1 className="text-2xl font-bold">You&apos;re all set 💛</h1>
          <p className="text-muted">Your plan is active. Enjoy your conversations.</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold">We&apos;re confirming your payment</h1>
          <p className="text-muted">
            This can take a minute. If you were charged, your plan will activate automatically. If it doesn&apos;t within
            10 minutes, contact support with your Paystack reference{reference ? `: ${reference}` : "."}
          </p>
        </>
      )}
      <Link href="/chat" className="btn mx-auto">
        Back to chat
      </Link>
    </main>
  );
}
