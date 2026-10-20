import { disableSubscription } from "@/lib/billing/paystack";
import { requireUser, supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Hard-deletes the account. Every user table cascades from auth.users, so
// this removes profile, character, messages, usage, subscription and reports.
export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { confirm } = await req.json().catch(() => ({}));
  if (confirm !== "DELETE") return Response.json({ error: "Type DELETE to confirm" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: sub } = await db
    .from("subscriptions")
    .select("paystack_subscription_code, paystack_email_token")
    .eq("user_id", user.id)
    .maybeSingle();

  // Stop future charges before the record that links us to Paystack is gone.
  if (sub?.paystack_subscription_code && sub.paystack_email_token) {
    try {
      await disableSubscription(sub.paystack_subscription_code, sub.paystack_email_token);
    } catch (e) {
      console.error("failed to disable paystack subscription", e);
      return Response.json(
        { error: "We couldn't cancel your subscription with Paystack. Please try again in a moment." },
        { status: 502 },
      );
    }
  }

  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) return Response.json({ error: "Could not delete account" }, { status: 500 });
  await supabase.auth.signOut();
  return Response.json({ ok: true });
}
