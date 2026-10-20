import { z } from "zod";

// Long-term memory: after a reply, a utility model call pulls durable facts
// out of the user's message ("my sister Ngozi is getting married in May").

export const MEMORY_CATEGORIES = ["identity", "preference", "person", "event", "goal", "feeling", "other"] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export interface Memory {
  id: string;
  fact: string;
  category: MemoryCategory;
  updated_at: string;
}

export const MAX_MEMORIES_PER_CHARACTER = 100;
const MAX_FACT_CHARS = 200;
const MAX_NEW_FACTS = 5;

// Cheap pre-filter so we only pay for an extraction call when the message
// plausibly contains something about the user.
const SELF_REFERENCE = /\b(i|im|i m|ive|i ve|ill|i ll|id|my|me|mine|myself|we|our|i dey|i don|i go|i wan)\b/;

export function shouldExtract(text: string): boolean {
  const t = text.toLowerCase().replace(/['’]/g, "");
  return t.length >= 15 && SELF_REFERENCE.test(t);
}

export function buildExtractionPrompt(existing: Pick<Memory, "fact">[], userMessage: string) {
  const known = existing.length
    ? existing.map((m, i) => `${i}. ${m.fact}`).join("\n")
    : "(nothing yet)";
  const system = `You maintain a short memory file about a user of a companion chat app, so their partner can remember them.

Extract only durable, useful facts the user states about themselves or people in their life: name, job, city, family, friends, likes and dislikes, plans and upcoming events (with dates), goals, important feelings or struggles.
Do not store: small talk, things about the AI partner, one-off moods ("I'm tired"), anything sexual, passwords, card numbers, account details, ID numbers, or exact addresses.
Write each fact in the third person, under ${MAX_FACT_CHARS} characters, in English even if the user wrote in Pidgin. Example: "Has a sister called Ngozi who is getting married in May 2027."
If a new fact updates or contradicts a known fact, set "replaces" to that fact's number. Never repeat a known fact.

Reply with only JSON, no prose: {"facts": [{"fact": string, "category": one of ${MEMORY_CATEGORIES.join("|")}, "replaces": number or null}]}
Return {"facts": []} when there is nothing worth remembering.`;
  const user = `Known facts:\n${known}\n\nUser's latest message:\n"""${userMessage}"""`;
  return { system, user };
}

const extractionSchema = z.object({
  facts: z
    .array(
      z.object({
        fact: z.string().trim().min(3),
        category: z.enum(MEMORY_CATEGORIES).catch("other"),
        replaces: z.number().int().nullable().optional(),
      }),
    )
    .default([]),
});

export interface ExtractionResult {
  add: { fact: string; category: MemoryCategory }[];
  replaceIds: string[];
}

// Tolerant parser: models sometimes wrap JSON in prose or code fences.
export function parseExtraction(raw: string, existing: Pick<Memory, "id" | "fact">[]): ExtractionResult {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return { add: [], replaceIds: [] };
  let json: unknown;
  try {
    json = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { add: [], replaceIds: [] };
  }
  const parsed = extractionSchema.safeParse(json);
  if (!parsed.success) return { add: [], replaceIds: [] };

  const known = new Set(existing.map((m) => normaliseFact(m.fact)));
  const add: ExtractionResult["add"] = [];
  const replaceIds: string[] = [];
  for (const f of parsed.data.facts.slice(0, MAX_NEW_FACTS)) {
    const fact = f.fact.slice(0, MAX_FACT_CHARS);
    if (known.has(normaliseFact(fact))) continue;
    known.add(normaliseFact(fact));
    add.push({ fact, category: f.category });
    if (typeof f.replaces === "number" && existing[f.replaces]) replaceIds.push(existing[f.replaces].id);
  }
  return { add, replaceIds };
}

function normaliseFact(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}
