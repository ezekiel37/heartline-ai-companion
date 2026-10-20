"use client";

import { useState } from "react";
import { formatNaira, type Plan } from "@/lib/plans";

const FEATURE_LABELS: Record<string, string> = {
  chat: "Much more chat every day",
  memory: "Long-term memory",
  avatar_studio: "Avatar studio",
  wardrobe: "Wardrobe shop",
  gifts: "Surprise gifts from your partner",
  bonus_coins: "Bonus coins every month",
  exclusive_outfits: "Exclusive outfits",
  voice: "Voice messages",
};

// Paywall copy lives in the UI, never in the character's mouth (spec §3).
export function Paywall({ plans, compact = true }: { plans: Plan[]; compact?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(planId: string) {
    setBusy(planId);
    setError(null);
    const res = await fetch("/api/paystack/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.url) {
      window.location.href = body.url;
      return;
    }
    if (res.status === 401) {
      window.location.href = "/login?next=/pricing";
      return;
    }
    setBusy(null);
    setError(body.error ?? "Could not start payment.");
  }

  return (
    <section className={compact ? "border-t border-border p-4" : ""}>
      {compact && (
        <div className="mb-3">
          <h2 className="font-semibold">You&apos;ve used today&apos;s free messages</h2>
          <p className="text-sm text-muted">Pick a plan to keep talking, or come back tomorrow for more free messages.</p>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {plans.map((p) => {
          const perDay = Math.round(p.price_kobo / 100 / p.duration_days);
          return (
            <div key={p.id} className="card flex flex-col gap-3 p-4">
              <div className="flex items-baseline justify-between">
                <span className="font-semibold">{p.name}</span>
                <span className="text-xs text-muted">≈ ₦{perDay}/day</span>
              </div>
              <div className="text-2xl font-bold">{formatNaira(p.price_kobo)}</div>
              <p className="text-xs text-muted">
                {p.billing === "pass" ? "One-time payment. Doesn't auto-renew." : "Renews automatically. Cancel anytime."}
              </p>
              {!compact && (
                <ul className="space-y-1 text-sm">
                  <li>Up to {p.daily_message_cap} messages a day</li>
                  {p.features.filter((f) => f !== "chat").map((f) => (
                    <li key={f}>{FEATURE_LABELS[f] ?? f}</li>
                  ))}
                </ul>
              )}
              <button className="btn mt-auto" disabled={busy !== null} onClick={() => choose(p.id)}>
                {busy === p.id ? "Opening Paystack…" : `Choose ${p.name}`}
              </button>
            </div>
          );
        })}
      </div>
      {error && <p className="mt-2 text-sm text-accent">{error}</p>}
    </section>
  );
}
