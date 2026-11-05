import type { BaseMessageLike } from "@langchain/core/messages";
import { readSettings } from "./config";
import { createChatModel } from "./providers";
import type { LlmDeps, ModelSize } from "./types";

// Asks the model for free text and hands over each piece as it is produced.
//
//   const markdown = await streamText("large", messages, (piece) => show(piece));
//   // onToken("The "), onToken("package "), ... and finally markdown === "The package ..."
//
// Returns the whole text at the end. A provider may send a piece as plain text or as a list of
// content blocks (Anthropic does); only the text parts are used.

const realDeps: LlmDeps = { settings: readSettings, create: createChatModel };

export async function streamText(
  size: ModelSize,
  messages: BaseMessageLike[],
  onToken: (piece: string) => void | Promise<void>,
  deps: LlmDeps = realDeps,
): Promise<string> {
  const model = deps.create(deps.settings(size));
  let text = "";
  for await (const chunk of await model.stream(messages)) {
    const piece = textOf(chunk.content);
    if (piece === "") continue;
    text += piece;
    await onToken(piece);
  }
  return text;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      typeof part === "object" && part !== null && "text" in part
        ? String((part as { text: unknown }).text)
        : "",
    )
    .join("");
}
