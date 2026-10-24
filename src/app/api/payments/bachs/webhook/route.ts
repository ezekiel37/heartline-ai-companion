import { handleBachsWebhook } from "@/lib/billing/handleWebhook";
import { webhookDeps } from "@/lib/deps";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const raw = await req.text(); // signature is over the raw body
  try {
    const outcome = await handleBachsWebhook(
      webhookDeps(supabaseAdmin()),
      raw,
      req.headers.get("x-bachs-signature-v2"),
      process.env.BACHS_WEBHOOK_SECRET ?? "",
    );
    return Response.json({ received: outcome.reason }, { status: outcome.status });
  } catch (e) {
    console.error("bachs webhook failed", e);
    // A 5xx makes Bachs retry the delivery (several times over ~80 minutes).
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
