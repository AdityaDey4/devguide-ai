import { markersIn } from "../../../generate/nodes/writeSection/citations";
import { NOT_COVERED } from "../../config";
import type { ChatDeps } from "../../deps";
import type { ChatCitation, ChatStateType, ChatUpdate } from "../../state";
import { buildMessages } from "./prompt";

// Step 3 of the chat graph (FR-CHAT-8, FR-CHAT-10): write the answer from the chunks, streaming it,
// and report which of them it cited.
//
//   state.chunks = [guide chunk, docs chunk]  ->  reply: "Use `z.url()` [2]."
//                                                 citations: [{ n: 2, title, url, kind: "docs" }]
//
// With no chunks the model is not asked at all: the fixed "couldn't find it" text is sent. This
// is how the chat says it doesn't know instead of inventing (done-when of M6).
// `onToken` receives the text piece by piece while it is written.

export async function answer(
  state: ChatStateType,
  deps: ChatDeps,
  onToken: (piece: string) => void | Promise<void>,
): Promise<ChatUpdate> {
  if (state.chunks.length === 0) {
    await onToken(NOT_COVERED);
    return { reply: NOT_COVERED, citations: [] };
  }

  const text = await deps.write(
    buildMessages(state.technology, state.standaloneQuery, state.chunks),
    onToken,
  );

  // excerpt n is chunks[n - 1]; a number that matches no excerpt is not a citation
  const citations: ChatCitation[] = markersIn(text)
    .filter((n) => n >= 1 && n <= state.chunks.length)
    .map((n) => {
      const chunk = state.chunks[n - 1];
      return {
        n,
        title: chunk.sourceTitle ?? chunk.headingPath ?? "Guide",
        url: chunk.sourceUrl,
        kind: chunk.sourceType === "guide" ? "guide" : "docs",
      };
    });

  return { reply: text, citations };
}
