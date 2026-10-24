import Link from "next/link";
import { Paywall } from "@/components/Paywall";
import { FREE_DAILY_MESSAGES, FREE_FIRST_DAY_MESSAGES, type Plan } from "@/lib/plans";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const supabase = await supabaseServer();
  const { data: plans } = await supabase.from("plans").select("*").order("sort");

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/chat" className="text-sm text-muted">
        ← Back to chat
      </Link>
      <h1 className="mt-4 text-3xl font-bold">Plans</h1>
      <p className="mt-2 text-muted">
        Free: {FREE_FIRST_DAY_MESSAGES} messages on your first day, then {FREE_DAILY_MESSAGES} a day. Paid plans unlock
        everything below. Prices in Naira. Pay by card or bank transfer.
      </p>
      <div className="mt-6">
        <Paywall plans={(plans ?? []) as Plan[]} compact={false} />
      </div>
    </main>
  );
}
