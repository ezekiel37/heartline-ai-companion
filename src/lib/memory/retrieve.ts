import type { Memory } from "./extract";

// Picks which memories go into the prompt. Keyword overlap with the latest
// message plus recency and category weight: no embeddings needed at this
// scale (≤100 short facts per character). Swap for vector search later if needed.

const STOPWORDS = new Set(
  "a an the and or but if to of in on at for with from by is are was were be been am i me my you your we our they their he she it his her them this that these those do does did have has had not no so just very really about what when where who how dey na go wan don".split(" "),
);

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

const CATEGORY_WEIGHT: Record<Memory["category"], number> = {
  identity: 3,
  person: 1.5,
  event: 1.5,
  goal: 1,
  feeling: 1,
  preference: 0.5,
  other: 0,
};

export function selectMemories(memories: Memory[], query: string, now: Date, limit = 15): Memory[] {
  if (memories.length <= limit) return memories;
  const q = tokens(query);
  const scored = memories.map((m) => {
    let overlap = 0;
    for (const t of tokens(m.fact)) if (q.has(t)) overlap++;
    const ageDays = (now.getTime() - new Date(m.updated_at).getTime()) / 86_400_000;
    const recency = Math.max(0, 1 - ageDays / 60);
    return { m, score: overlap * 3 + CATEGORY_WEIGHT[m.category] + recency };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.m);
}

export function formatMemories(memories: Memory[]): string {
  if (!memories.length) return "";
  return [
    "Things you remember about the user from earlier conversations (use naturally when relevant; don't list them back or say you have a memory file):",
    ...memories.map((m) => `- ${m.fact}`),
  ].join("\n");
}
