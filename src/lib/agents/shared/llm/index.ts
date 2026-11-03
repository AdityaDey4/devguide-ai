import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { readSettings } from "./config";
import { createChatModel } from "./providers";
import type { LlmDeps, ModelSize } from "./types";

export { LlmConfigError } from "./errors";
export type { LlmSettings, ModelSize, Provider } from "./types";

// The one place graph nodes get a language model from (docs/03-Architecture.md section 5.2).
//
//   const writer = largeModel();                       // writing sections, answers: temperature 0.2
//   const judge = smallModel();                        // grading, rewriting, checking: temperature 0
//   const verdict = await judge.withStructuredOutput(schema).invoke(messages);
//
// LLM_PROVIDER (openai | anthropic) picks the company; LLM_MODEL_LARGE / LLM_MODEL_SMALL
// optionally pick the model names. Nodes only see LangChain's BaseChatModel, so changing
// provider needs no change in any node (SRS NFR-MAINT-1). Temporary API errors are retried
// by LangChain with growing pauses (numbers in config.ts).
// Read this file first: it is the whole recipe. Server only: it uses API keys.

const realDeps: LlmDeps = { settings: readSettings, create: createChatModel };

export function getModel(
  size: ModelSize,
  deps: LlmDeps = realDeps,
): BaseChatModel {
  return deps.create(deps.settings(size)); // 1. read provider, key, model  2. build the chat model
}

export const largeModel = (deps?: LlmDeps) => getModel("large", deps);
export const smallModel = (deps?: LlmDeps) => getModel("small", deps);
