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

const perDay = (p: Plan) => p.price_kobo / 100 / p.duration_days;

// Paywall copy lives in the UI, never in the character's mouth (spec §3).
export function Paywall({ plans, compact = true }: { plans: Plan[]; compact?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(planId: string) {
    setBusy(planId);
    setError(null);
    const res = await fetch("/api/checkout", {
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

  // Highlight the cheapest plan per day, and lead with it in the in-chat paywall.
  const best = plans.length > 1 ? plans.reduce((a, b) => (perDay(b) < perDay(a) ? b : a)) : null;
  const ordered = compact && best ? [best, ...plans.filter((p) => p.id !== best.id)] : plans;

  return (
    <section className={compact ? "border-t border-border p-4" : ""}>
      {compact && (
        <div className="mb-3">
          <h2 className="font-semibold">You&apos;ve used today&apos;s free messages</h2>
          <p className="text-sm text-muted">Pick a plan to keep talking, or come back tomorrow for more free messages.</p>
        </div>
      )}
      <div className="grid gap-5 pt-2 sm:grid-cols-2">
        {ordered.map((p) => {
          const isBest = best?.id === p.id;
          const extras = p.features.filter((f) => f !== "chat").map((f) => (FEATURE_LABELS[f] ?? f).toLowerCase());
          return (
            <div key={p.id} className={`card relative flex flex-col gap-3 p-4 ${isBest ? "border-2 border-accent" : ""}`}>
              {isBest && (
                <span className="absolute -top-3 left-4 rounded-full bg-accent px-3 py-0.5 text-xs font-semibold text-white">
                  Best value
                </span>
              )}
              <div className="flex items-baseline justify-between">
                <span className="font-semibold">{p.name}</span>
                <span className="text-xs text-muted">≈ ₦{Math.round(perDay(p))}/day</span>
              </div>
              <div className="text-2xl font-bold">{formatNaira(p.price_kobo)}</div>
              {compact && (
                <p className="text-sm">
                  Up to {p.daily_message_cap} messages a day, plus {extras.slice(0, 3).join(", ")}
                  {extras.length > 3 ? " and more" : ""}.
                </p>
              )}
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
              <button className={`${isBest ? "btn" : "btn-ghost"} mt-auto`} disabled={busy !== null} onClick={() => choose(p.id)}>
                {busy === p.id ? "Opening checkout…" : `Choose ${p.name}`}
              </button>
            </div>
          );
        })}
      </div>
      {error && <p className="mt-2 text-sm text-accent">{error}</p>}
    </section>
  );
}
