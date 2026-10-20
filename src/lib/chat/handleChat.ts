import { isAdult } from "../age";
import { featuresFor } from "../features";
import { costUsd, type ChatTurn, type ChatUsage, type LlmProvider } from "../llm";
import { buildExtractionPrompt, parseExtraction, shouldExtract, type ExtractionResult, type Memory } from "../memory/extract";
import { formatMemories, selectMemories } from "../memory/retrieve";
import {
  buildSystemPrompt,
  COACH_INSTRUCTION,
  CRISIS_INSTRUCTION,
  recentGiftsNote,
  type CharacterConfig,
  type Language,
} from "../persona";
import { dailyAllowance, type Plan, type Subscription } from "../plans";
import { detectCrisis } from "../safety/crisis";
import { moderateInput, moderateOutput } from "../safety/moderation";
import { appDate } from "../time";

// Core chat logic, independent of Next.js and Supabase so it can be tested
// with in-memory fakes. The route in app/api/chat wires in the real deps.

export const MAX_MESSAGE_CHARS = 2000;
export const CONTEXT_MESSAGES = 20;

export type ChatMode = "chat" | "coach";

export interface ChatProfile {
  dob: string | null;
  blocked: boolean;
  language: Language;
  display_name: string | null;
  created_at: string;
}

export interface ChatCharacter extends CharacterConfig {
  id: string;
}

export interface ChatDeps {
  now(): Date;
  llm: LlmProvider;
  utilityLlm: LlmProvider;
  getProfile(userId: string): Promise<ChatProfile | null>;
  getCharacter(userId: string): Promise<ChatCharacter | null>;
  getSubscription(userId: string): Promise<{ subscription: Subscription; plan: Plan } | null>;
  // Atomically increments today's counter if it is below `limit`.
  consumeMessage(userId: string, date: string, limit: number): Promise<{ allowed: boolean; used: number }>;
  refundMessage(userId: string, date: string): Promise<void>;
  recentMessages(characterId: string, limit: number): Promise<ChatTurn[]>; // oldest first
  saveMessage(m: {
    id?: string;
    userId: string;
    characterId: string;
    role: "user" | "assistant";
    content: string;
    usage?: ChatUsage;
    costUsd?: number;
    flagged?: boolean;
  }): Promise<string>;
  logSafetyEvent(userId: string, type: string): Promise<void>;
  newId(): string;
  getMemories(characterId: string): Promise<Memory[]>;
  saveMemories(userId: string, characterId: string, result: ExtractionResult): Promise<void>;
  recordUtilityUsage(userId: string, purpose: string, usage: ChatUsage, costUsd: number): Promise<void>;
  recentGifts(userId: string, since: Date): Promise<{ kind: string; message: string }[]>;
  runGifts(userId: string): Promise<void>;
}

export type ChatEvent =
  | { t: "meta"; tier: "free" | "paid"; limit: number; remaining: number; crisis: boolean; messageId: string }
  | { t: "delta"; v: string }
  | { t: "done"; remaining: number }
  | { t: "error"; message: string };

export type ChatResult =
  | { ok: false; status: number; error: string; paywall?: boolean; tier?: "free" | "paid"; limit?: number }
  | {
      ok: true;
      events: AsyncIterable<ChatEvent>;
      // Work to run after the response has been sent (memory, gifts).
      // Only populated once `events` has been fully consumed.
      runBackground(): Promise<void>;
    };

const SAFE_REFUSAL =
  "I can't go there with you. Anything involving minors is completely off-limits. Let's talk about something else.";
const REFUSAL_FALLBACK = "Hmm, I don't think I can answer that one. Can we talk about something else? 💛";
const OUTPUT_GUARD = " …let's keep it sweet, not explicit. 💛";
const GIFT_CONTEXT_DAYS = 3;

export async function handleChat(
  deps: ChatDeps,
  userId: string,
  rawText: unknown,
  opts: { mode?: ChatMode } = {},
): Promise<ChatResult> {
  const text = typeof rawText === "string" ? rawText.trim() : "";
  if (!text) return { ok: false, status: 400, error: "Message is empty" };
  if (text.length > MAX_MESSAGE_CHARS) return { ok: false, status: 400, error: "Message is too long" };

  const now = deps.now();
  const profile = await deps.getProfile(userId);
  if (!profile || profile.blocked || !isAdult(profile.dob, now)) {
    return { ok: false, status: 403, error: "Account not eligible" };
  }
  const character = await deps.getCharacter(userId);
  if (!character) return { ok: false, status: 409, error: "Finish onboarding first" };

  const sub = await deps.getSubscription(userId);
  const features = featuresFor(sub?.subscription ?? null, sub?.plan ?? null, now);
  const today = appDate(now);
  const allowance = dailyAllowance({
    subscription: sub?.subscription ?? null,
    plan: sub?.plan ?? null,
    accountCreatedDate: appDate(new Date(profile.created_at)),
    today,
    now,
  });

  const consumed = await deps.consumeMessage(userId, today, allowance.limit);
  if (!consumed.allowed) {
    return {
      ok: false,
      status: allowance.tier === "free" ? 402 : 429,
      error: allowance.tier === "free" ? "Free messages used up" : "Daily fair-use limit reached",
      paywall: allowance.tier === "free",
      tier: allowance.tier,
      limit: allowance.limit,
    };
  }
  const remaining = Math.max(allowance.limit - consumed.used, 0);

  const crisis = detectCrisis(text);
  if (crisis.flagged) await deps.logSafetyEvent(userId, "crisis_detected");

  const inputMod = moderateInput(text);
  await deps.saveMessage({ userId, characterId: character.id, role: "user", content: text, flagged: inputMod.flagged });

  const assistantId = deps.newId();
  const meta: ChatEvent = { t: "meta", tier: allowance.tier, limit: allowance.limit, remaining, crisis: crisis.flagged, messageId: assistantId };
  const background: (() => Promise<void>)[] = [];
  const runBackground = async () => {
    for (const task of background) {
      try {
        await task();
      } catch (e) {
        console.error("chat background task failed", e);
      }
    }
  };

  if (inputMod.flagged) {
    await deps.logSafetyEvent(userId, `moderation_input:${inputMod.categories.join(",")}`);
    return {
      ok: true,
      runBackground,
      events: (async function* () {
        yield meta;
        yield { t: "delta", v: SAFE_REFUSAL } as ChatEvent;
        await deps.saveMessage({ id: assistantId, userId, characterId: character.id, role: "assistant", content: SAFE_REFUSAL });
        yield { t: "done", remaining } as ChatEvent;
      })(),
    };
  }

  const history = trimToUserStart(await deps.recentMessages(character.id, CONTEXT_MESSAGES));
  const memories = features.has("memory") ? await deps.getMemories(character.id) : [];
  const gifts = features.has("gifts")
    ? await deps.recentGifts(userId, new Date(now.getTime() - GIFT_CONTEXT_DAYS * 86_400_000))
    : [];

  const system = [
    buildSystemPrompt({ character, language: profile.language, userName: profile.display_name }),
    formatMemories(selectMemories(memories, text, now)),
    recentGiftsNote(gifts),
    opts.mode === "coach" && features.has("coach") ? COACH_INSTRUCTION : "",
    crisis.flagged ? CRISIS_INSTRUCTION : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Don't turn crisis disclosures into stored "facts".
  if (features.has("memory") && !crisis.flagged && shouldExtract(text)) {
    background.push(async () => {
      const prompt = buildExtractionPrompt(memories, text);
      const { text: out, usage } = await deps.utilityLlm.complete({
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
        maxTokens: 1024,
      });
      await deps.recordUtilityUsage(userId, "memory_extraction", usage, costUsd(usage));
      const result = parseExtraction(out, memories);
      if (result.add.length || result.replaceIds.length) await deps.saveMemories(userId, character.id, result);
    });
  }
  if (features.has("gifts")) background.push(() => deps.runGifts(userId));

  return {
    ok: true,
    runBackground,
    events: (async function* () {
      yield meta;
      const stream = deps.llm.stream({ system, messages: history, maxTokens: opts.mode === "coach" ? 3000 : 2048 });
      let reply = "";
      let flagged = false;
      try {
        for await (const chunk of stream.text) {
          if (moderateOutput(reply + chunk).flagged) {
            flagged = true;
            stream.abort();
            break;
          }
          reply += chunk;
          yield { t: "delta", v: chunk } as ChatEvent;
        }
        if (flagged) {
          reply += OUTPUT_GUARD;
          yield { t: "delta", v: OUTPUT_GUARD } as ChatEvent;
          await deps.logSafetyEvent(userId, "moderation_output:sexual_explicit");
        }
        const usage = flagged ? null : await stream.usage();
        if (usage?.refused && !reply.trim()) {
          reply = REFUSAL_FALLBACK;
          yield { t: "delta", v: reply } as ChatEvent;
        }
        await deps.saveMessage({
          id: assistantId,
          userId,
          characterId: character.id,
          role: "assistant",
          content: reply,
          usage: usage ?? undefined,
          costUsd: usage ? costUsd(usage) : undefined,
          flagged,
        });
        yield { t: "done", remaining } as ChatEvent;
      } catch (e) {
        console.error("chat stream failed", e);
        background.length = 0; // nothing to remember from a failed turn
        // Don't charge the user's allowance for our failure.
        await deps.refundMessage(userId, today);
        yield { t: "error", message: "Something went wrong. Please try again." } as ChatEvent;
      }
    })(),
  };
}

// The model API requires the conversation to start with a user turn.
function trimToUserStart(turns: ChatTurn[]): ChatTurn[] {
  const i = turns.findIndex((t) => t.role === "user");
  return i === -1 ? [] : turns.slice(i);
}
