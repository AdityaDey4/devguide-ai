import type { ChatDeps } from "../../deps";
import { HISTORY_MESSAGES } from "../../config";
import type { ChatStateType, ChatUpdate } from "../../state";
import { buildMessages } from "./prompt";
import { UnderstandAnswer } from "./schema";

// Step 1 of the chat graph (FR-CHAT-2): turn the latest message into a question that stands on
// its own, plus a few other wordings for the search.
//
//   history: "how do I validate an email?" / "Use z.email()..."   question: "and a URL?"
//     -> { standaloneQuery: "How do I validate a URL with Zod?", variants: ["z.url schema", ...] }
//
// Only the last 6 messages are looked at. One call to the small model.

export async function understand(
  state: ChatStateType,
  deps: ChatDeps,
): Promise<ChatUpdate> {
  const recent = state.history.slice(-HISTORY_MESSAGES);
  const answer = await deps.ask(
    "small",
    UnderstandAnswer,
    buildMessages(state.technology, recent, state.question),
  );

  return {
    // an empty rewrite must never replace the question itself
    standaloneQuery: answer.standalone.trim() || state.question,
    variants: answer.variants,
  };
}
