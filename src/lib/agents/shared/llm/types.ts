import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

/** What the graph asks for: a strong model for writing, a cheap fast one for judging. */
export type ModelSize = "large" | "small";

export type Provider = "openai" | "anthropic";

/** Everything needed to build one chat model. */
export type LlmSettings = {
  provider: Provider;
  apiKey: string;
  model: string;
  temperature: number;
  timeoutMs: number;
  maxRetries: number;
  maxOutputTokens: number;
};

/** What getModel needs from the outside. Tests pass fakes here. */
export type LlmDeps = {
  settings: (size: ModelSize) => LlmSettings;
  create: (settings: LlmSettings) => BaseChatModel;
};
