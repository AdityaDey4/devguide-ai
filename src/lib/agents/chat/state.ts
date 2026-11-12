import { Annotation } from "@langchain/langgraph";
import type { Ranked } from "../../rag/reranker";

// What the chat graph remembers while it answers ONE question (docs/03-Architecture.md section
// 5.2). Nothing is saved between questions in M6: the page keeps the conversation.

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatTechnology = {
  id: string;
  name: string;
  version: string | null;
};

/** A source the answer cited: `url` is null for the guide's own text. */
export type ChatCitation = {
  n: number;
  title: string;
  url: string | null;
  kind: "guide" | "docs";
};

/** A value that is simply replaced by the newest one. */
const latest = <T>(initial: () => T) =>
  Annotation<T>({ reducer: (_old, value) => value, default: initial });

export const ChatState = Annotation.Root({
  technology: latest<ChatTechnology>(() => ({
    id: "",
    name: "",
    version: null,
  })),
  /** The guide whose own text may be searched too. */
  guideId: latest<string | null>(() => null),
  /** The messages before this question, oldest first. */
  history: latest<ChatMessage[]>(() => []),
  question: latest<string>(() => ""),
  /** The question rewritten so it makes sense on its own. */
  standaloneQuery: latest<string>(() => ""),
  /** Other ways to ask the same thing, for the search. */
  variants: latest<string[]>(() => []),
  /** The few chunks the answer is written from, best first. */
  chunks: latest<Ranked[]>(() => []),
  reply: latest<string>(() => ""),
  citations: latest<ChatCitation[]>(() => []),
});

export type ChatStateType = typeof ChatState.State;
export type ChatUpdate = Partial<ChatStateType>;
