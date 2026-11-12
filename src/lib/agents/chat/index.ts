import type { ChatDeps } from "./deps";
import { buildChatGraph } from "./graph";
import type { ChatCitation, ChatMessage, ChatTechnology } from "./state";

export type { ChatCitation, ChatMessage, ChatTechnology } from "./state";

// Answers one question about a technology from what is stored (SRS FR-CHAT-1 to FR-CHAT-3).
//
//   const { answer, citations } = await askGuide(
//     { technology: { id, name: "Zod", version: "4.1.0" }, guideId, history, question: "and a URL?" },
//     (piece) => send(piece),          // called with the answer text as it is written
//   );
//   citations -> [{ n: 1, title: "Defining schemas", url: "https://zod.dev/api", kind: "docs" }]
//
// Steps: understand the question (small model) -> find and rerank stored chunks -> write the
// answer with citations (large model). Read graph.ts for the arrows. Server only.

export type AskGuideInput = {
  technology: ChatTechnology;
  /** The guide whose own text may be searched too. */
  guideId?: string;
  /** The messages before this question, oldest first. */
  history: ChatMessage[];
  question: string;
};

export type AskGuideResult = { answer: string; citations: ChatCitation[] };

export async function askGuide(
  input: AskGuideInput,
  onToken: (piece: string) => void | Promise<void>,
  deps?: ChatDeps,
): Promise<AskGuideResult> {
  const graph = buildChatGraph(onToken, deps);
  const finished = await graph.invoke({
    technology: input.technology,
    guideId: input.guideId ?? null,
    history: input.history,
    question: input.question,
  });
  return { answer: finished.reply, citations: finished.citations };
}
