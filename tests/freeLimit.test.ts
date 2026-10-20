import { describe, expect, it } from "vitest";
import { handleChat } from "@/lib/chat/handleChat";
import { dailyAllowance, FREE_DAILY_MESSAGES, FREE_FIRST_DAY_MESSAGES } from "@/lib/plans";
import { collect, makeChatDeps, USER } from "./fakes";

const NOW = new Date("2026-10-20T12:00:00Z");

describe("free message limit", () => {
  it("gives 10 messages on the signup day and 3 per day after", () => {
    const base = { subscription: null, plan: null, now: NOW, today: "2026-10-20" };
    expect(dailyAllowance({ ...base, accountCreatedDate: "2026-10-20" })).toEqual({ tier: "free", limit: FREE_FIRST_DAY_MESSAGES });
    expect(dailyAllowance({ ...base, accountCreatedDate: "2026-10-19" })).toEqual({ tier: "free", limit: FREE_DAILY_MESSAGES });
  });

  it("counts down remaining messages server-side", async () => {
    const { deps } = makeChatDeps({ now: NOW, profile: { created_at: "2026-10-20T08:00:00Z" } });
    const first = await handleChat(deps, USER, "hi");
    if (!first.ok) throw new Error("expected ok");
    const events = await collect(first.events);
    expect(events[0]).toMatchObject({ t: "meta", tier: "free", limit: 10, remaining: 9 });
  });

  it("rejects bad input without consuming allowance", async () => {
    const { deps, usage } = makeChatDeps({ now: NOW });
    expect(await handleChat(deps, USER, "   ")).toMatchObject({ ok: false, status: 400 });
    expect(await handleChat(deps, USER, "x".repeat(2001))).toMatchObject({ ok: false, status: 400 });
    expect(usage.size).toBe(0);
  });

  it("blocks under-18 and blocked accounts", async () => {
    const minor = makeChatDeps({ now: NOW, profile: { dob: "2010-01-01" } });
    expect(await handleChat(minor.deps, USER, "hi")).toMatchObject({ ok: false, status: 403 });
    const blocked = makeChatDeps({ now: NOW, profile: { blocked: true } });
    expect(await handleChat(blocked.deps, USER, "hi")).toMatchObject({ ok: false, status: 403 });
  });

  it("refunds the message if the model call fails", async () => {
    const { deps, usage } = makeChatDeps({
      now: NOW,
      llm: {
        name: "broken",
        model: "broken",
        stream: () => ({
          text: (async function* () {
            throw new Error("upstream down");
          })(),
          usage: () => Promise.reject(new Error("no")),
          abort: () => {},
        }),
      },
    });
    const res = await handleChat(deps, USER, "hi");
    if (!res.ok) throw new Error("expected ok");
    const events = await collect(res.events);
    expect(events.at(-1)).toMatchObject({ t: "error" });
    expect([...usage.values()][0]).toBe(0);
  });
});
