// Provider-agnostic chat interface. The rest of the app only talks to this,
// so swapping model vendors means writing one new provider file.

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  system: string;
  messages: ChatTurn[]; // oldest first; must start with a user turn
  maxTokens?: number;
}

export interface ChatUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  refused: boolean;
}

export interface ChatStream {
  text: AsyncIterable<string>;
  // Resolves after `text` has been fully consumed.
  usage(): Promise<ChatUsage>;
  abort(): void;
}

export interface LlmProvider {
  name: string;
  model: string;
  stream(req: ChatRequest): ChatStream;
  // Non-streaming call for background utility work (e.g. memory extraction).
  complete(req: ChatRequest): Promise<{ text: string; usage: ChatUsage }>;
}
