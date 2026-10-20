import { anthropicProvider } from "./llm/anthropic";
import { mockProvider } from "./llm/mock";
import type { ChatUsage, LlmProvider } from "./llm/types";

export type { ChatTurn, ChatUsage, LlmProvider } from "./llm/types";

// USD per million tokens. Keep in sync with your provider's price list; this
// drives the per-user cost log used to tune pricing.
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  mock: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

export function costUsd(u: ChatUsage): number {
  const p = PRICES[u.model] ?? Object.entries(PRICES).find(([k]) => u.model.startsWith(k))?.[1];
  if (!p) return 0;
  return (
    (u.inputTokens * p.input +
      u.outputTokens * p.output +
      u.cacheReadTokens * p.cacheRead +
      u.cacheWriteTokens * p.cacheWrite) /
    1_000_000
  );
}

// The chat model talks to users; the utility model does background work such
// as memory extraction. They default to the same model; set
// LLM_UTILITY_MODEL to a cheaper one if quality holds.
export function getLlm(): LlmProvider {
  return makeProvider(process.env.LLM_MODEL || "claude-opus-5-5");
}

export function getUtilityLlm(): LlmProvider {
  return makeProvider(process.env.LLM_UTILITY_MODEL || process.env.LLM_MODEL || "claude-opus-5-5");
}

function makeProvider(model: string): LlmProvider {
  const provider = process.env.LLM_PROVIDER || "anthropic";
  switch (provider) {
    case "anthropic":
      return anthropicProvider(model);
    case "mock":
      return mockProvider();
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
  }
}
