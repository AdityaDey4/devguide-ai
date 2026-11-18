import { DIRECT_REPLIES } from "../config";
import type { ChatStateType, ChatUpdate } from "../state";

// A message that is not a question about the technology ("Hi", "kfjrkferljk", "What is Java?" in a
// chat about LangChain) gets a short fixed reply, with nothing searched and no model writing: the
// search would only find text about the technology and the answer would pretend it was asked.
//
//   state.intent = "greeting", technology "LangChain"
//     -> reply: "Hi! Ask me anything about LangChain and I'll answer from its documentation."
//        origin: "none"  (no source label is shown)

export async function directReply(
  state: ChatStateType,
  onToken: (piece: string) => void | Promise<void>,
): Promise<ChatUpdate> {
  const intent = state.intent === "question" ? "unclear" : state.intent;
  const reply = DIRECT_REPLIES[intent](state.technology.name);
  await onToken(reply);
  return { reply, citations: [], origin: "none" };
}
