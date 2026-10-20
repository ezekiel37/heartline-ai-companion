import Link from "next/link";
import { loadSubscription } from "@/lib/deps";
import { requireEligibleUser } from "@/lib/gate";
import { formatNaira, hasActiveAccess } from "@/lib/plans";
import { DeleteAccount, LanguageSwitch } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { supabase, user, profile } = await requireEligibleUser({ needCharacter: false });
  const sub = await loadSubscription(supabase, user.id);
  const active = hasActiveAccess(sub?.subscription ?? null, new Date());

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <Link href="/chat" className="text-sm text-muted">
        ← Back to chat
      </Link>
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="card space-y-2">
        <h2 className="font-semibold">Plan</h2>
        {active && sub ? (
          <p className="text-sm">
            {sub.plan.name} ({formatNaira(sub.plan.price_kobo)}) · {sub.subscription.status === "cancelled" ? "ends" : "renews/ends"}{" "}
            {new Date(sub.subscription.current_period_end!).toLocaleDateString("en-NG", { dateStyle: "medium" })}
          </p>
        ) : (
          <p className="text-sm">
            Free plan. <Link href="/pricing" className="underline">See plans</Link>
          </p>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Language</h2>
        <LanguageSwitch initial={profile!.language as "en" | "pcm"} />
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Account</h2>
        <p className="text-sm text-muted">{user.email}</p>
        <form action="/auth/signout" method="post">
          <button className="btn-ghost">Sign out</button>
        </form>
      </section>

      <section className="card space-y-3 border-accent">
        <h2 className="font-semibold">Delete my account and data</h2>
        <p className="text-sm text-muted">
          Permanently deletes your profile, your partner, all chats and any other data we hold about you, and cancels any
          auto-renewing subscription. This can&apos;t be undone.
        </p>
        <DeleteAccount />
      </section>

      <p className="flex gap-4 text-sm text-muted">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </p>
    </main>
  );
}
