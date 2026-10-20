import { handlePaystackWebhook } from "@/lib/billing/handleWebhook";
import { webhookDeps } from "@/lib/deps";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const raw = await req.text(); // signature is over the raw body
  try {
    const outcome = await handlePaystackWebhook(
      webhookDeps(supabaseAdmin()),
      raw,
      req.headers.get("x-paystack-signature"),
      process.env.PAYSTACK_SECRET_KEY!,
    );
    return Response.json({ received: outcome.reason }, { status: outcome.status });
  } catch (e) {
    console.error("paystack webhook failed", e);
    // Non-2xx makes Paystack retry later.
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
