import { describe, expect, it } from "vitest";
import { handleChat } from "@/lib/chat/handleChat";
import { collect, makeChatDeps, USER } from "./fakes";

const NOW = new Date("2026-10-20T12:00:00Z");

describe("paywall lock", () => {
  it("locks a free user after the 10th message on day one and never calls the model", async () => {
    const t = makeChatDeps({ now: NOW, profile: { created_at: "2026-10-20T08:00:00Z" } });
    for (let i = 0; i < 10; i++) {
      const r = await handleChat(t.deps, USER, `message ${i}`);
      expect(r.ok).toBe(true);
      if (r.ok) await collect(r.events);
    }
    const callsBefore = t.llmCalls();
    const eleventh = await handleChat(t.deps, USER, "one more?");
    expect(eleventh).toMatchObject({ ok: false, status: 402, paywall: true, tier: "free" });
    expect(t.llmCalls()).toBe(callsBefore);
  });

  it("unlocks with an active subscription and applies the plan's fair-use cap instead", async () => {
    const t = makeChatDeps({
      now: NOW,
      subscription: { user_id: USER, plan_id: "two_week", status: "active", current_period_end: "2026-10-30T00:00:00Z" },
    });
    const r = await handleChat(t.deps, USER, "hey");
    if (!r.ok) throw new Error("expected ok");
    expect((await collect(r.events))[0]).toMatchObject({ tier: "paid", limit: 60, remaining: 59 });
  });

  it("returns 429 (not the paywall) when a subscriber hits the fair-use cap", async () => {
    const t = makeChatDeps({
      now: NOW,
      subscription: { user_id: USER, plan_id: "two_week", status: "active", current_period_end: "2026-10-30T00:00:00Z" },
    });
    t.usage.set(`${USER}:2026-10-20`, 60);
    expect(await handleChat(t.deps, USER, "hey")).toMatchObject({ ok: false, status: 429, paywall: false });
  });

  it("treats expired, past_due and cancelled-after-period subscriptions as free", async () => {
    for (const sub of [
      { status: "active" as const, current_period_end: "2026-10-01T00:00:00Z" },
      { status: "past_due" as const, current_period_end: "2026-10-30T00:00:00Z" },
      { status: "cancelled" as const, current_period_end: "2026-10-19T00:00:00Z" },
    ]) {
      const t = makeChatDeps({ now: NOW, subscription: { user_id: USER, plan_id: "monthly", ...sub } });
      t.usage.set(`${USER}:2026-10-20`, 3);
      expect(await handleChat(t.deps, USER, "hey")).toMatchObject({ ok: false, status: 402, paywall: true });
    }
  });

  it("keeps access for a cancelled subscription until the paid period ends", async () => {
    const t = makeChatDeps({
      now: NOW,
      subscription: { user_id: USER, plan_id: "monthly", status: "cancelled", current_period_end: "2026-11-01T00:00:00Z" },
    });
    expect((await handleChat(t.deps, USER, "hey")).ok).toBe(true);
  });
});
