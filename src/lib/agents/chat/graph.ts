import { END, START, StateGraph } from "@langchain/langgraph";
import type { ChatDeps } from "./deps";
import { answer } from "./nodes/answer";
import { retrieve } from "./nodes/retrieve";
import { understand } from "./nodes/understand";
import { realDeps } from "./realDeps";
import { ChatState } from "./state";

// The chat graph, minimal (docs/03-Architecture.md section 5.2; grading and outside sources are M7).
//
//   START -> understand -> retrieve -> answer -> END
//
// Nodes are plain functions `node(state, deps)`; the arrows below only hand them their deps.
// `onToken` gets the answer text piece by piece. No checkpointer: a question is one short run.

export function buildChatGraph(
  onToken: (piece: string) => void | Promise<void>,
  deps: ChatDeps = realDeps,
) {
  return new StateGraph(ChatState)
    .addNode("understand", (state) => understand(state, deps))
    .addNode("retrieve", (state) => retrieve(state, deps))
    .addNode("answer", (state) => answer(state, deps, onToken))
    .addEdge(START, "understand")
    .addEdge("understand", "retrieve")
    .addEdge("retrieve", "answer")
    .addEdge("answer", END)
    .compile();
}
