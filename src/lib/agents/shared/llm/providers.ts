import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { LlmSettings } from "./types";

// The provider switch: turns settings into the right LangChain chat model. Both classes share
// one interface (BaseChatModel), so graph nodes never know which provider is behind them.
// Retries are done by LangChain itself (model.caller): 429, 5xx and dropped connections are
// retried with growing pauses. The timeout is passed to each provider's client.

export function createChatModel(settings: LlmSettings): BaseChatModel {
  switch (settings.provider) {
    case "openai":
      return new ChatOpenAI({
        apiKey: settings.apiKey,
        model: settings.model,
        temperature: settings.temperature,
        timeout: settings.timeoutMs,
        maxRetries: settings.maxRetries,
        maxTokens: settings.maxOutputTokens,
      });
    case "anthropic":
      return new ChatAnthropic({
        apiKey: settings.apiKey,
        model: settings.model,
        temperature: settings.temperature,
        maxRetries: settings.maxRetries,
        maxTokens: settings.maxOutputTokens,
        clientOptions: { timeout: settings.timeoutMs },
      });
  }
}
