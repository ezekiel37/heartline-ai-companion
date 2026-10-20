import { describe, expect, it } from "vitest";
import { handleChat } from "@/lib/chat/handleChat";
import { mockProvider } from "@/lib/llm/mock";
import { parseExtraction, shouldExtract, type Memory } from "@/lib/memory/extract";
import { selectMemories } from "@/lib/memory/retrieve";
import { collect, makeChatDeps, USER } from "./fakes";

const NOW = new Date("2026-10-20T12:00:00Z");
const mem = (id: string, fact: string, category: Memory["category"] = "other", updated_at = "2026-10-01T00:00:00Z"): Memory => ({
  id,
  fact,
  category,
  updated_at,
});

describe("memory extraction", () => {
  it("only spends an extraction call on messages that talk about the user", () => {
    expect(shouldExtract("My sister Ngozi is getting married in May")).toBe(true);
    expect(shouldExtract("I dey work for bank for Yaba")).toBe(true);
    expect(shouldExtract("lol")).toBe(false);
    expect(shouldExtract("What's your favourite colour?")).toBe(false);
  });

  it("parses model output tolerantly, dedupes and resolves replacements", () => {
    const existing = [mem("a", "Works as a nurse in Ibadan."), mem("b", "Likes jollof rice.")];
    const raw = 'Sure!\n```json\n{"facts":[{"fact":"Works as a doctor in Lagos.","category":"identity","replaces":0},{"fact":"likes jollof rice","category":"preference","replaces":null},{"fact":"Has a dog named Bingo.","category":"weird"}]}\n```';
    const r = parseExtraction(raw, existing);
    expect(r.add).toEqual([
      { fact: "Works as a doctor in Lagos.", category: "identity" },
      { fact: "Has a dog named Bingo.", category: "other" },
    ]);
    expect(r.replaceIds).toEqual(["a"]);
  });

  it("returns nothing for junk", () => {
    expect(parseExtraction("I can't help with that", [])).toEqual({ add: [], replaceIds: [] });
    expect(parseExtraction("{not json}", [])).toEqual({ add: [], replaceIds: [] });
  });
});

describe("memory retrieval", () => {
  it("prefers facts related to the current message, then identity facts", () => {
    const memories = [
      ...Array.from({ length: 30 }, (_, i) => mem(`p${i}`, `Likes colour number ${i}.`, "preference")),
      mem("name", "Is called Ada.", "identity"),
      mem("sis", "Sister Ngozi is getting married in May.", "person"),
    ];
    const picked = selectMemories(memories, "I'm nervous about Ngozi's wedding", NOW, 5).map((m) => m.id);
    expect(picked[0]).toBe("sis");
    expect(picked).toContain("name");
  });
});

describe("memory in chat", () => {
  it("injects remembered facts into the prompt and extracts new ones after the reply", async () => {
    const t = makeChatDeps({
      now: NOW,
      memories: [mem("m1", "Has a sister called Ngozi.", "person")],
      utilityLlm: mockProvider("", '{"facts":[{"fact":"Starts a new job at a bank on Monday.","category":"event","replaces":null}]}'),
    });
    const r = await handleChat(t.deps, USER, "I start my new job at the bank on Monday!");
    if (!r.ok) throw new Error("expected ok");
    await collect(r.events);
    expect(t.systems[0]).toMatch(/Has a sister called Ngozi/);
    expect(t.memories).toHaveLength(1); // extraction hasn't run yet: it's background work
    await r.runBackground();
    expect(t.memories.map((m) => m.fact)).toContain("Starts a new job at a bank on Monday.");
  });

  it("does not run extraction for small talk or crisis messages", async () => {
    const t = makeChatDeps({ now: NOW });
    for (const msg of ["hi", "I want to end my life"]) {
      const r = await handleChat(t.deps, USER, msg);
      if (!r.ok) throw new Error("expected ok");
      await collect(r.events);
      await r.runBackground();
    }
    expect(t.utilityCalls).toHaveLength(0);
  });

  it("adds the coach instruction only in coach mode", async () => {
    const t = makeChatDeps({ now: NOW });
    for (const mode of ["chat", "coach"] as const) {
      const r = await handleChat(t.deps, USER, "Should I text him first?", { mode });
      if (r.ok) await collect(r.events);
    }
    expect(t.systems[0]).not.toMatch(/Coach mode is on/);
    expect(t.systems[1]).toMatch(/Coach mode is on/);
  });
});
