import { isAdult } from "../age";
import { costUsd, type ChatTurn, type ChatUsage, type LlmProvider } from "../llm";
import { buildSystemPrompt, CRISIS_INSTRUCTION, type CharacterConfig, type Language } from "../persona";
import { dailyAllowance, type Plan, type Subscription } from "../plans";
import { detectCrisis } from "../safety/crisis";
import { moderateInput, moderateOutput } from "../safety/moderation";
import { appDate } from "../time";

// Core chat logic, independent of Next.js and Supabase so it can be tested
// with in-memory fakes. The route in app/api/chat wires in the real deps.

export const MAX_MESSAGE_CHARS = 2000;
export const CONTEXT_MESSAGES = 20;

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
}

export type ChatEvent =
  | { t: "meta"; tier: "free" | "paid"; limit: number; remaining: number; crisis: boolean; messageId: string }
  | { t: "delta"; v: string }
  | { t: "done"; remaining: number }
  | { t: "error"; message: string };

export type ChatResult =
  | { ok: false; status: number; error: string; paywall?: boolean; tier?: "free" | "paid"; limit?: number }
  | { ok: true; events: AsyncIterable<ChatEvent> };

const SAFE_REFUSAL =
  "I can't go there with you. Anything involving minors is completely off-limits. Let's talk about something else.";
const REFUSAL_FALLBACK = "Hmm, I don't think I can answer that one. Can we talk about something else? 💛";
const OUTPUT_GUARD = " …let's keep it sweet, not explicit. 💛";

export async function handleChat(deps: ChatDeps, userId: string, rawText: unknown): Promise<ChatResult> {
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

  if (inputMod.flagged) {
    await deps.logSafetyEvent(userId, `moderation_input:${inputMod.categories.join(",")}`);
    return {
      ok: true,
      events: (async function* () {
        yield meta;
        yield { t: "delta", v: SAFE_REFUSAL } as ChatEvent;
        await deps.saveMessage({ id: assistantId, userId, characterId: character.id, role: "assistant", content: SAFE_REFUSAL });
        yield { t: "done", remaining } as ChatEvent;
      })(),
    };
  }

  const history = trimToUserStart(await deps.recentMessages(character.id, CONTEXT_MESSAGES));
  let system = buildSystemPrompt({ character, language: profile.language, userName: profile.display_name });
  if (crisis.flagged) system += `\n\n${CRISIS_INSTRUCTION}`;

  return {
    ok: true,
    events: (async function* () {
      yield meta;
      const stream = deps.llm.stream({ system, messages: history });
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
