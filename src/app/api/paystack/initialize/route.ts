import { initializeTransaction } from "@/lib/billing/paystack";
import { requireUser, supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { user } = await requireUser();
  if (!user?.email) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { planId } = await req.json().catch(() => ({}));
  const db = supabaseAdmin();
  const { data: plan } = await db.from("plans").select("*").eq("id", planId).eq("active", true).maybeSingle();
  if (!plan) return Response.json({ error: "Unknown plan" }, { status: 400 });
  if (plan.billing === "recurring" && !plan.paystack_plan_code) {
    return Response.json({ error: "Plan is not configured for billing yet" }, { status: 503 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  try {
    const tx = await initializeTransaction({
      email: user.email,
      amountKobo: plan.price_kobo,
      planCode: plan.billing === "recurring" ? plan.paystack_plan_code : null,
      callbackUrl: `${origin}/billing/callback`,
      metadata: { user_id: user.id, plan_id: plan.id },
    });
    return Response.json({ url: tx.authorization_url });
  } catch (e) {
    console.error("paystack initialize failed", e);
    return Response.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
}
