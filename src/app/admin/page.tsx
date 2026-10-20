import { notFound } from "next/navigation";
import { deriveMetrics, isAdmin, type RawMetrics } from "@/lib/admin/metrics";
import { requireUser, supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const naira = (n: number | null) => (n == null ? "—" : `₦${Math.round(n).toLocaleString("en-NG")}`);
const pct = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);

export default async function AdminPage() {
  const { user } = await requireUser();
  // 404 rather than 403 so the page's existence isn't advertised.
  if (!isAdmin(user?.email)) notFound();

  const { data, error } = await supabaseAdmin().rpc("admin_metrics");
  if (error) throw error;
  const raw = data as RawMetrics;
  const ngnPerUsd = Number(process.env.NGN_PER_USD) || 1500;
  const d = deriveMetrics(raw, ngnPerUsd);

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-sm text-muted">Last 30 days unless noted. Costs converted at ₦{ngnPerUsd}/$ (set NGN_PER_USD).</p>
      </header>

      <Section title="Users">
        <Stat label="Users" value={raw.users_total.toLocaleString()} />
        <Stat label="New (7 days)" value={raw.users_new_7d.toLocaleString()} />
        <Stat label="Active today" value={raw.dau.toLocaleString()} />
        <Stat label="Active this week" value={raw.wau.toLocaleString()} />
        <Stat label="DAU / WAU" value={pct(d.dauWauPct)} />
      </Section>

      <Section title="Revenue">
        <Stat label="Paying now" value={raw.paying_active.toLocaleString()} />
        <Stat label="Conversion" value={pct(d.conversionPct)} />
        <Stat label="Revenue" value={naira(d.revenue30dNgn)} />
        <Stat label="Per paying user" value={naira(d.arppuNgn)} />
        <Stat label="From plans" value={naira((raw.revenue_30d_by_kind.plan ?? 0) / 100)} />
        <Stat label="From coins" value={naira((raw.revenue_30d_by_kind.coins ?? 0) / 100)} />
        {Object.entries(raw.paying_by_plan).map(([plan, n]) => (
          <Stat key={plan} label={`On ${plan}`} value={String(n)} />
        ))}
      </Section>

      <Section title="AI cost">
        <Stat label="Total" value={naira(d.llmCost30dNgn)} hint={`$${Number(raw.llm_cost_30d_usd).toFixed(2)}`} />
        <Stat label="Background (memory)" value={`$${Number(raw.llm_cost_30d_background_usd).toFixed(2)}`} />
        <Stat label="Per paying user" value={naira(d.llmCostPerPayingUserNgn)} />
        <Stat label="Per reply" value={d.costPerReplyUsd == null ? "—" : `$${d.costPerReplyUsd.toFixed(4)}`} />
        <Stat
          label="Gross margin after AI"
          value={pct(d.grossMarginPct)}
          tone={d.grossMarginPct != null && d.grossMarginPct < 50 ? "bad" : undefined}
        />
      </Section>

      <section className="space-y-2">
        <h2 className="font-semibold">Most expensive users</h2>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-accent-soft text-left">
              <tr>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Replies</th>
                <th className="px-3 py-2 font-medium">Cost</th>
                <th className="px-3 py-2 font-medium">Paying</th>
              </tr>
            </thead>
            <tbody>
              {raw.top_cost_users.map((u) => (
                <tr key={u.user_id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{u.user_id.slice(0, 8)}…</td>
                  <td className="px-3 py-2 tabular-nums">{u.replies}</td>
                  <td className="px-3 py-2 tabular-nums">{naira(Number(u.usd) * ngnPerUsd)}</td>
                  <td className="px-3 py-2">{u.paying ? "Yes" : "No"}</td>
                </tr>
              ))}
              {!raw.top_cost_users.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-muted">No usage yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Section title="Safety (7 days)">
        <Stat label="Reported messages" value={String(raw.reports_7d)} />
        {Object.entries(raw.safety_7d).map(([type, n]) => (
          <Stat key={type} label={type.replace(/_/g, " ")} value={String(n)} />
        ))}
        <Stat label="Coins in wallets" value={raw.coins_outstanding.toLocaleString()} />
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{children}</div>
    </section>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "bad" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tone === "bad" ? "text-accent" : ""}`}>{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}
