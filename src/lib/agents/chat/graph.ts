import { END, START, StateGraph } from "@langchain/langgraph";
import type { ChatDeps } from "./deps";
import { answer } from "./nodes/answer";
import { context7 } from "./nodes/context7";
import { grade } from "./nodes/grade";
import { liveFetch } from "./nodes/liveFetch";
import { mergeAndRerank } from "./nodes/mergeAndRerank";
import { retrieve } from "./nodes/retrieve";
import { understand } from "./nodes/understand";
import { realDeps } from "./realDeps";
import { ChatState, type ChatStateType } from "./state";

// The chat graph (docs/03-Architecture.md section 5.2, corrective hybrid RAG).
//
//   START -> understand -> retrieve -> gradeChunks --GOOD--------------------------------> answer -> END
//                                          |                                                 ^
//                                  PARTIAL / BAD                                             |
//                                          v                                                 |
//                                 context7 ┐  (both at once, searching for what is missing)  |
//                                 liveFetch┘ -> mergeAndRerank -> regrade ------------------+
//
// The outside lookups happen at most once per question (FR-CHAT-11: one external round); the
// second grade only refreshes `state.grade`, it never loops back. Nodes are plain functions
// `node(state, deps)`; the arrows below only hand them their deps. `onToken` gets the answer text
// piece by piece. No checkpointer: a question is one short run.

export function buildChatGraph(
  onToken: (piece: string) => void | Promise<void>,
  deps: ChatDeps = realDeps,
) {
  return new StateGraph(ChatState)
    .addNode("understand", (state) => understand(state, deps))
    .addNode("retrieve", (state) => retrieve(state, deps))
    .addNode("gradeChunks", (state) => grade(state, deps))
    .addNode("context7", (state) => context7(state, deps))
    .addNode("liveFetch", (state) => liveFetch(state, deps))
    .addNode("mergeAndRerank", (state) => mergeAndRerank(state, deps))
    .addNode("regrade", (state) => grade(state, deps))
    .addNode("answer", (state) => answer(state, deps, onToken))
    .addEdge(START, "understand")
    .addEdge("understand", "retrieve")
    .addEdge("retrieve", "gradeChunks")
    .addConditionalEdges("gradeChunks", afterGrade, [
      "answer",
      "context7",
      "liveFetch",
    ])
    .addEdge(["context7", "liveFetch"], "mergeAndRerank") // waits for both
    .addEdge("mergeAndRerank", "regrade")
    .addEdge("regrade", "answer")
    .addEdge("answer", END)
    .compile();
}

/** GOOD: write the answer. Otherwise look outside the stored text, both ways at once. */
function afterGrade(
  state: ChatStateType,
): "answer" | ["context7", "liveFetch"] {
  return state.grade?.verdict === "GOOD" ? "answer" : ["context7", "liveFetch"];
}
