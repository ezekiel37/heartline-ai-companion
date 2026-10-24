import { paymentProvider, startCheckout, type CheckoutRequest } from "@/lib/billing/provider";
import { featuresFor } from "@/lib/features";
import { loadSubscription } from "@/lib/deps";
import { formatNaira, MAX_COIN_SPEND_KOBO_PER_DAY } from "@/lib/plans";
import { requireUser, supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Starts a hosted checkout (Bachs or Paystack, see PAYMENT_PROVIDER) for a
// plan ({planId}) or a coin pack ({packId}). Prices always come from the database.
export async function POST(req: Request) {
  const { user } = await requireUser();
  if (!user?.email) return Response.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const db = supabaseAdmin();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const callbackUrl = `${origin}/billing/callback`;

  let checkout: CheckoutRequest;

  if (typeof body.packId === "string") {
    const { data: pack } = await db.from("coin_packs").select("*").eq("id", body.packId).eq("active", true).maybeSingle();
    if (!pack) return Response.json({ error: "Unknown coin pack" }, { status: 400 });

    // Coins only buy wardrobe items, so only sell them to users who can use the shop.
    const sub = await loadSubscription(db, user.id);
    if (!featuresFor(sub?.subscription ?? null, sub?.plan ?? null, new Date()).has("wardrobe")) {
      return Response.json({ error: "Coins are available on paid plans" }, { status: 402 });
    }

    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { data: recent } = await db
      .from("payments")
      .select("amount_kobo")
      .eq("user_id", user.id)
      .eq("kind", "coins")
      .gte("created_at", since);
    const spent = (recent ?? []).reduce((n, p) => n + p.amount_kobo, 0);
    if (spent + pack.price_kobo > MAX_COIN_SPEND_KOBO_PER_DAY) {
      return Response.json(
        { error: `You've reached the daily coin limit of ${formatNaira(MAX_COIN_SPEND_KOBO_PER_DAY)}. Try again tomorrow.` },
        { status: 429 },
      );
    }

    checkout = {
      email: user.email,
      amountKobo: pack.price_kobo,
      callbackUrl,
      cancelUrl: `${origin}/shop`,
      metadata: { user_id: user.id, kind: "coins", pack_id: pack.id },
    };
  } else {
    const { data: plan } = await db.from("plans").select("*").eq("id", body.planId).eq("active", true).maybeSingle();
    if (!plan) return Response.json({ error: "Unknown plan" }, { status: 400 });
    if (plan.billing === "recurring" && (paymentProvider() !== "paystack" || !plan.paystack_plan_code)) {
      // Bachs can't auto-renew NGN plans; selling one would promise a renewal that never happens.
      console.error(`plan ${plan.id} is recurring but the payment provider can't bill it`);
      return Response.json({ error: "Plan is not configured for billing yet" }, { status: 503 });
    }
    checkout = {
      email: user.email,
      amountKobo: plan.price_kobo,
      paystackPlanCode: plan.billing === "recurring" ? plan.paystack_plan_code : null,
      callbackUrl,
      cancelUrl: `${origin}/pricing`,
      metadata: { user_id: user.id, kind: "plan", plan_id: plan.id },
    };
  }

  try {
    return Response.json({ url: await startCheckout(checkout) });
  } catch (e) {
    console.error("checkout start failed", e);
    return Response.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
}
