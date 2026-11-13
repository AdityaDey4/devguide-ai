import type { ChatDeps } from "../../deps";
import type { ChatStateType, ChatUpdate } from "../../state";
import { buildMessages } from "./prompt";
import { GradeAnswer } from "./schema";

export type { Grade } from "./schema";

// The grading step of the chat graph (SRS FR-CHAT-5, docs/03-Architecture.md section 5.2): are the
// retrieved chunks enough to answer the question?
//
//   chunks answer it fully      -> { verdict: "GOOD",    missing: "" }
//   chunks cover half of it     -> { verdict: "PARTIAL", missing: "how to write a file (fs.writeFile)" }
//   chunks are about something else -> { verdict: "BAD", missing: "..." }
//
// `missing` is what the next step searches for outside the stored text. With no chunks at all the
// answer is known (BAD, missing = the whole question) and the model is not asked. One call to the
// small model otherwise.

export async function grade(
  state: ChatStateType,
  deps: ChatDeps,
): Promise<ChatUpdate> {
  if (state.chunks.length === 0) {
    return {
      grade: { verdict: "BAD", missing: state.standaloneQuery },
    };
  }

  const answer = await deps.ask(
    "small",
    GradeAnswer,
    buildMessages(state.technology, state.standaloneQuery, state.chunks),
  );

  // Make the two fields agree, whatever the model wrote: GOOD misses nothing, and anything
  // else must say what to search for (the whole question if the model gave nothing).
  const missing = answer.missing.trim();
  return {
    grade:
      answer.verdict === "GOOD"
        ? { verdict: "GOOD", missing: "" }
        : {
            verdict: answer.verdict,
            missing: missing || state.standaloneQuery,
          },
  };
}
