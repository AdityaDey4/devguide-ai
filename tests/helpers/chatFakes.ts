import type { ChatDeps } from "@/lib/agents/chat/deps";
import type { ChatStateType } from "@/lib/agents/chat/state";
import type { Ranked } from "@/lib/rag/reranker";
import type { RetrieveInput } from "@/lib/rag/retriever";

// Fake dependencies for the chat graph: no model, no database. Each fake records what it was
// asked, and the answers are set by the test.

export function ranked(over: Partial<Ranked> = {}): Ranked {
  return {
    id: "c1",
    content: "Use z.url() to validate a URL.",
    headingPath: "API > Strings",
    sourceType: "official",
    sourceId: "s1",
    sourceUrl: "https://zod.dev/api",
    sourceTitle: "Defining schemas",
    score: 0.03,
    relevance: 0.9,
    ...over,
  };
}

export function fakeChatDeps(
  answers: {
    standalone?: string;
    variants?: string[];
    /** What the search finds and what the reranker keeps. */
    found?: Ranked[];
    /** What the writer produces. */
    text?: string;
  } = {},
) {
  const asked: unknown[][] = [];
  const retrieved: RetrieveInput[] = [];
  const written: unknown[][] = [];

  const deps: ChatDeps = {
    ask: async (_size, _schema, messages) => {
      asked.push(messages);
      return {
        standalone: answers.standalone ?? "How do I validate a URL with Zod?",
        variants: answers.variants ?? [
          "z.url schema",
          "check a string is a URL",
        ],
      } as never;
    },
    retrieve: async (input) => {
      retrieved.push(input);
      return answers.found ?? [];
    },
    rerank: async ({ candidates }) =>
      candidates.map((c) => ({ ...ranked(), ...c })) as Ranked[],
    write: async (messages, onToken) => {
      written.push(messages);
      const text = answers.text ?? "Use `z.url()` [1].";
      for (const piece of text.match(/[\s\S]{1,6}/g) ?? [])
        await onToken(piece);
      return text;
    },
  };
  return { deps, asked, retrieved, written };
}

/** A starting state for calling one node directly. */
export function chatStateWith(
  overrides: Partial<ChatStateType> = {},
): ChatStateType {
  return {
    technology: { id: "t1", name: "Zod", version: "4.1.0" },
    guideId: "g1",
    history: [],
    question: "and a URL?",
    standaloneQuery: "How do I validate a URL with Zod?",
    variants: [],
    chunks: [],
    reply: "",
    citations: [],
    ...overrides,
  };
}
