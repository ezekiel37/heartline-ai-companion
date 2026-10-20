import { initializeTransaction } from "@/lib/billing/paystack";
import { featuresFor } from "@/lib/features";
import { loadSubscription } from "@/lib/deps";
import { formatNaira, MAX_COIN_SPEND_KOBO_PER_DAY } from "@/lib/plans";
import { requireUser, supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Starts a Paystack checkout for a plan ({planId}) or a coin pack ({packId}).
export async function POST(req: Request) {
  const { user } = await requireUser();
  if (!user?.email) return Response.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const db = supabaseAdmin();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const callbackUrl = `${origin}/billing/callback`;

  let checkout: Parameters<typeof initializeTransaction>[0];

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
      metadata: { user_id: user.id, kind: "coins", pack_id: pack.id },
    };
  } else {
    const { data: plan } = await db.from("plans").select("*").eq("id", body.planId).eq("active", true).maybeSingle();
    if (!plan) return Response.json({ error: "Unknown plan" }, { status: 400 });
    if (plan.billing === "recurring" && !plan.paystack_plan_code) {
      return Response.json({ error: "Plan is not configured for billing yet" }, { status: 503 });
    }
    checkout = {
      email: user.email,
      amountKobo: plan.price_kobo,
      planCode: plan.billing === "recurring" ? plan.paystack_plan_code : null,
      callbackUrl,
      metadata: { user_id: user.id, kind: "plan", plan_id: plan.id },
    };
  }

  try {
    const tx = await initializeTransaction(checkout);
    return Response.json({ url: tx.authorization_url });
  } catch (e) {
    console.error("paystack initialize failed", e);
    return Response.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
}
