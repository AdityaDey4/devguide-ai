import { flushTraces, traceConfig } from "../shared/tracing";
import type { ChatDeps } from "./deps";
import { docsWorthKeeping } from "./fetched";
import { buildChatGraph } from "./graph";
import type { ChatOrigin } from "./origin";
import type {
  ChatCitation,
  ChatMessage,
  ChatTechnology,
  ExternalDoc,
} from "./state";

export type { ChatCitation, ChatMessage, ChatTechnology } from "./state";
export type { ChatOrigin } from "./origin";
export type { ExternalDoc } from "./state";

// Answers one question about a technology from what is stored (SRS FR-CHAT-1 to FR-CHAT-3).
//
//   const { answer, citations } = await askGuide(
//     { technology: { id, name: "Zod", version: "4.1.0" }, guideId, history, question: "and a URL?" },
//     (piece) => send(piece),          // called with the answer text as it is written
//   );
//   citations -> [{ n: 1, title: "Defining schemas", url: "https://zod.dev/api", kind: "docs" }]
//   origin    -> "stored_docs"   (guide | stored_docs | fetched_now | not_found)
//
// Steps: understand the question (small model) -> find and rerank stored chunks -> write the
// answer with citations (large model). Read graph.ts for the arrows. Server only.

export type AskGuideInput = {
  technology: ChatTechnology;
  /** The guide whose own text may be searched too. */
  guideId?: string;
  /** The shared guide, when `guideId` is a person's copy. */
  alsoGuideId?: string;
  /** Fingerprints of shared passages the person's copy replaced (see lib/chat/scope.ts). */
  hiddenHashes?: string[];
  /** The messages before this question, oldest first. */
  history: ChatMessage[];
  question: string;
};

export type AskGuideResult = {
  answer: string;
  citations: ChatCitation[];
  origin: ChatOrigin;
  /** Pages found outside the stored text that the answer used: worth saving for next time. */
  toStore: ExternalDoc[];
  /** True when the answer is one saved earlier: nothing was searched or written. */
  cached: boolean;
  /** The question as the chat understood it on its own (what the answer cache is keyed on). */
  standaloneQuery: string;
  /** The last grade of the text the answer was written from; null if it was never graded. */
  grade: "GOOD" | "PARTIAL" | "BAD" | null;
};

export async function askGuide(
  input: AskGuideInput,
  onToken: (piece: string) => void | Promise<void>,
  deps?: ChatDeps,
): Promise<AskGuideResult> {
  const graph = buildChatGraph(onToken, deps);
  const finished = await graph
    .invoke(
      {
        technology: input.technology,
        guideId: input.guideId ?? null,
        alsoGuideId: input.alsoGuideId ?? null,
        hiddenHashes: input.hiddenHashes ?? [],
        history: input.history,
        question: input.question,
      },
      traceConfig("chat", {
        technology: input.technology.name,
        technologyId: input.technology.id,
        guideId: input.guideId,
      }),
    )
    .finally(flushTraces);
  return {
    answer: finished.reply,
    citations: finished.citations,
    origin: finished.origin,
    cached: finished.fromCache,
    standaloneQuery: finished.standaloneQuery,
    grade: finished.grade?.verdict ?? null,
    toStore: docsWorthKeeping(
      finished.external,
      finished.chunks,
      finished.origin,
    ),
  };
}
