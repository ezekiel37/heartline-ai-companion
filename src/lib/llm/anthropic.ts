import Anthropic from "@anthropic-ai/sdk";
import type { ChatRequest, ChatStream, ChatUsage, LlmProvider } from "./types";

export function anthropicProvider(model: string): LlmProvider {
  const client = new Anthropic();
  // Server-side refusal fallback isn't available for Haiku models.
  const useFallbacks = !model.includes("haiku");

  return {
    name: "anthropic",
    model,
    stream(req: ChatRequest): ChatStream {
      const stream = client.beta.messages.stream({
        model,
        max_tokens: req.maxTokens ?? 2048,
        // Persona prompt is stable per character; the conversation prefix is
        // cached automatically turn to turn.
        system: [{ type: "text", text: req.system }],
        cache_control: { type: "ephemeral" },
        messages: req.messages,
        // Casual chat doesn't benefit from deep reasoning; keep it fast and cheap.
        output_config: { effort: "low" },
        ...(useFallbacks
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
      });

      let resolveUsage!: (u: ChatUsage) => void;
      let rejectUsage!: (e: unknown) => void;
      const usagePromise = new Promise<ChatUsage>((res, rej) => {
        resolveUsage = res;
        rejectUsage = rej;
      });

      async function* text() {
        try {
          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              yield event.delta.text;
            }
          }
          const final = await stream.finalMessage();
          resolveUsage({
            model: final.model,
            inputTokens: final.usage.input_tokens,
            outputTokens: final.usage.output_tokens,
            cacheReadTokens: final.usage.cache_read_input_tokens ?? 0,
            cacheWriteTokens: final.usage.cache_creation_input_tokens ?? 0,
            refused: final.stop_reason === "refusal",
          });
        } catch (e) {
          rejectUsage(e);
          throw e;
        }
      }

      return { text: text(), usage: () => usagePromise, abort: () => stream.abort() };
    },
  };
}
