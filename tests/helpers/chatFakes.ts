import type { ChatDeps } from "@/lib/agents/chat/deps";
import { GradeAnswer, type Grade } from "@/lib/agents/chat/nodes/grade/schema";
import type { ChatStateType } from "@/lib/agents/chat/state";
import type { Snippet } from "@/lib/mcp/context7";
import type { Ranked } from "@/lib/rag/reranker";
import type { SearchHit } from "@/lib/agents/shared/tavily";
import type { Candidate, RetrieveInput } from "@/lib/rag/retriever";

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

/** A page long enough to count (the minimum is 200 characters), as Markdown. */
export const longPage = (title: string) =>
  `# ${title}

${`${title} explains how this part of the library works, with examples. `.repeat(6)}
`;

export function fakeChatDeps(
  answers: {
    standalone?: string;
    variants?: string[];
    /** What the search finds and what the reranker keeps. */
    found?: Ranked[];
    /** What the writer produces. */
    text?: string;
    /** What the grader says (default: GOOD). */
    grade?: Grade;
    /** What it says the second time, after the outside lookups (default: the same). */
    regrade?: Grade;
    /** What Context7 answers with (default: nothing). */
    snippets?: Snippet[];
    /** What the web search finds (default: nothing). */
    hits?: SearchHit[];
    /** The text of pages that can be downloaded; any other address gives a generic page. */
    pages?: Record<string, string>;
    /** Addresses that cannot be downloaded. */
    brokenUrls?: string[];
    /** Make the whole web search fail. */
    searchFails?: boolean;
  } = {},
) {
  const asked: unknown[][] = [];
  const retrieved: RetrieveInput[] = [];
  const written: unknown[][] = [];
  const grades: unknown[][] = [];
  const reranked: Candidate[][] = [];
  const snippetQueries: { name: string; topic: string }[] = [];
  const searches: { query: string; domains?: string[] }[] = [];
  const fetched: string[] = [];

  const deps: ChatDeps = {
    ask: async (_size, givenSchema, messages) => {
      asked.push(messages);
      const schema: unknown = givenSchema;
      if (schema === GradeAnswer) {
        grades.push(messages);
        const first = answers.grade ?? { verdict: "GOOD", missing: "" };
        return (
          grades.length > 1 ? (answers.regrade ?? first) : first
        ) as never;
      }
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
    rerank: async ({ candidates }) => {
      reranked.push(candidates);
      return candidates.map((c) => ({ ...ranked(), ...c })) as Ranked[];
    },
    codeSnippets: async (name, topic) => {
      snippetQueries.push({ name, topic });
      return answers.snippets ?? [];
    },
    searchWeb: async (query, options) => {
      searches.push({ query, domains: options?.includeDomains });
      if (answers.searchFails) throw new Error("Tavily is down");
      return answers.hits ?? [];
    },
    fetchPage: async (url) => {
      fetched.push(url);
      if (answers.brokenUrls?.includes(url)) throw new Error("HTTP 500");
      return {
        requestedUrl: url,
        url,
        status: 200,
        contentType: "text/markdown",
        body: answers.pages?.[url] ?? longPage("Page"),
        bytes: 1000,
        redirects: [],
        fetchedAt: new Date(),
      };
    },
    write: async (messages, onToken) => {
      written.push(messages);
      const text = answers.text ?? "Use `z.url()` [1].";
      for (const piece of text.match(/[\s\S]{1,6}/g) ?? [])
        await onToken(piece);
      return text;
    },
  };
  return {
    deps,
    asked,
    retrieved,
    written,
    grades,
    reranked,
    snippetQueries,
    searches,
    fetched,
  };
}

/** A starting state for calling one node directly. */
export function chatStateWith(
  overrides: Partial<ChatStateType> = {},
): ChatStateType {
  return {
    technology: {
      id: "t1",
      name: "Zod",
      version: "4.1.0",
      docsUrl: "https://zod.dev/docs/",
      officialUrl: "https://zod.dev",
    },
    guideId: "g1",
    history: [],
    question: "and a URL?",
    standaloneQuery: "How do I validate a URL with Zod?",
    variants: [],
    chunks: [],
    grade: null,
    external: [],
    reply: "",
    origin: "not_found",
    citations: [],
    ...overrides,
  };
}
