import type { BaseMessageLike } from "@langchain/core/messages";
import type { z } from "zod";
import { readSettings, STRUCTURED_MAX_OUTPUT_TOKENS } from "./config";
import { createChatModel } from "./providers";
import type { LlmDeps, ModelSize } from "./types";

// Asks the model a question and gets back a checked object instead of free text.
//
//   const verdict = await askStructured("small", z.object({ ok: z.boolean() }), messages);
//   verdict.ok  // typed boolean; the provider enforces the shape
//
// For OpenAI's strict mode every field must be required: use `.nullable()` for "maybe absent",
// never `.optional()`.

const realDeps: LlmDeps = { settings: readSettings, create: createChatModel };

export async function askStructured<S extends z.ZodType>(
  size: ModelSize,
  schema: S,
  messages: BaseMessageLike[],
  deps: LlmDeps = realDeps,
): Promise<z.infer<S>> {
  const settings = deps.settings(size);
  const model = deps.create({
    ...settings,
    maxOutputTokens: Math.min(
      settings.maxOutputTokens ?? STRUCTURED_MAX_OUTPUT_TOKENS,
      STRUCTURED_MAX_OUTPUT_TOKENS,
    ),
  });
  const answer = await model.withStructuredOutput(schema).invoke(messages);
  return answer as z.infer<S>;
}
