import { markersIn } from "../../../generate/nodes/writeSection/citations";
import { NOT_COVERED } from "../../config";
import type { ChatDeps } from "../../deps";
import { originOf } from "../../origin";
import type { ChatCitation, ChatStateType, ChatUpdate } from "../../state";
import { buildMessages } from "./prompt";

// Step 3 of the chat graph (FR-CHAT-8, FR-CHAT-10): write the answer from the chunks, streaming it,
// and report which of them it cited.
//
//   state.chunks = [guide chunk, docs chunk]  ->  reply: "Use `z.url()` [2]."
//                                                 citations: [{ n: 2, title, url, kind: "docs" }]
//                                                 origin: "stored_docs" (see origin.ts)
//
// Which of three things is said depends on the grade of the chunks (after the outside lookups,
// when they were needed; FR-CHAT-7):
//   GOOD     answer from the chunks
//   PARTIAL  answer what the chunks cover and say what they do not (`grade.missing`)
//   BAD      the honest "couldn't find it" text, without asking the model: nothing in the stored or
//            the outside text answers the question, so there is nothing to write from (this is how the
//            chat says it does not know instead of inventing; done-when of M6 and M7)
// No chunks at all is the same as BAD. `onToken` receives the text piece by piece while it is written.

export async function answer(
  state: ChatStateType,
  deps: ChatDeps,
  onToken: (piece: string) => void | Promise<void>,
): Promise<ChatUpdate> {
  if (state.chunks.length === 0 || state.grade?.verdict === "BAD") {
    await onToken(NOT_COVERED);
    return { reply: NOT_COVERED, citations: [], origin: "not_found" };
  }

  const text = await deps.write(
    buildMessages(
      state.technology,
      state.standaloneQuery,
      state.chunks,
      state.grade?.verdict === "PARTIAL" ? state.grade.missing : null,
    ),
    onToken,
  );

  // excerpt n is chunks[n - 1]; a number that matches no excerpt is not a citation
  const cited = markersIn(text).filter(
    (n) => n >= 1 && n <= state.chunks.length,
  );
  const citations: ChatCitation[] = cited.map((n) => {
    const chunk = state.chunks[n - 1];
    return {
      n,
      title: chunk.sourceTitle ?? chunk.headingPath ?? "Guide",
      url: chunk.sourceUrl,
      kind: chunk.sourceType === "guide" ? "guide" : "docs",
    };
  });

  // The origin is that of what the answer cited; an answer that cites nothing is judged by all
  // the chunks it was given.
  const used =
    cited.length > 0 ? cited.map((n) => state.chunks[n - 1]) : state.chunks;
  return { reply: text, citations, origin: originOf(used) };
}
