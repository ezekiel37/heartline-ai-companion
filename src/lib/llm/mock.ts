import type { ChatRequest, ChatStream, LlmProvider } from "./types";

// Deterministic provider for local development without an API key, and for tests.
export function mockProvider(reply = "I'm here for you. Tell me more about your day? 💛"): LlmProvider {
  return {
    name: "mock",
    model: "mock",
    stream(req: ChatRequest): ChatStream {
      const words = reply.split(/(\s+)/);
      async function* text() {
        for (const w of words) yield w;
      }
      return {
        text: text(),
        usage: async () => ({
          model: "mock",
          inputTokens: Math.ceil((req.system.length + req.messages.reduce((n, m) => n + m.content.length, 0)) / 4),
          outputTokens: Math.ceil(reply.length / 4),
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          refused: false,
        }),
        abort: () => {},
      };
    },
  };
}
