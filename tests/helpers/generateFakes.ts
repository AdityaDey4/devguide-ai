import type { z } from "zod";
import type { GenerateDeps } from "@/lib/agents/generate/deps";
import { IdentifyAnswer } from "@/lib/agents/generate/nodes/identify/schema";
import { OutlineAnswer } from "@/lib/agents/generate/nodes/planOutline/schema";
import type { GenerateStateType } from "@/lib/agents/generate/state";
import { newBudget } from "@/lib/agents/shared/budget";
import type { RunEvent } from "@/lib/agents/shared/events";
import type { SearchHit } from "@/lib/agents/shared/tavily";
import type { SaveGuideInput } from "@/lib/agents/generate/guide/saveGuide";
import type { StoreInput } from "@/lib/rag/store";

// Fake dependencies for the generation graph: no model, no web, no database. Each fake records
// what it was asked, and the answers are set by the test.

export const ZOD_HITS: SearchHit[] = [
  {
    title: "Zod",
    url: "https://zod.dev/",
    content: "TypeScript-first schema validation. Latest release v4.0.0",
  },
  {
    title: "Zod docs",
    url: "https://zod.dev/api",
    content: "Defining schemas",
  },
];

export const ZOD_ANSWER: z.infer<typeof IdentifyAnswer> = {
  outcome: "single",
  name: "Zod",
  officialUrl: "https://zod.dev/",
  docsUrl: "https://zod.dev/",
  candidates: [],
};

export const ZOD_PAGES = [
  { url: "https://zod.dev/", title: "Zod" },
  { url: "https://zod.dev/basics", title: "Basic usage" },
  { url: "https://zod.dev/api", title: "Defining schemas" },
];

/** A page long enough to count (the minimum is 200 characters), as Markdown. */
export const pageBody = (title: string) =>
  `# ${title}\n\n${`${title} explains how this part of the library works, with examples. `.repeat(6)}\n\n\`\`\`ts\nconst schema = z.string();\n\`\`\`\n`;

export function fakeDeps(
  answers: {
    identify?: () => z.infer<typeof IdentifyAnswer>;
    outline?: () => z.infer<typeof OutlineAnswer>;
    hits?: SearchHit[];
    pages?: { url: string; title: string }[];
    /** Pages that cannot be fetched. */
    brokenUrls?: string[];
    /** What the writer produces; gets the number of sources it was given. */
    /** What the writer produces. `rewrite` is true when it is asked to fix a draft. */
    text?: (sources: number, rewrite: boolean) => string;
    storeFails?: boolean;
  } = {},
) {
  const events: RunEvent[] = [];
  const searches: string[] = [];
  const asked: string[] = [];
  const saved: unknown[] = [];
  const fetched: string[] = [];
  const stored: StoreInput[] = [];
  const guides: SaveGuideInput[] = [];
  const written: { messages: unknown[] }[] = [];

  const deps: GenerateDeps = {
    events: () => ({
      emit: async (event) => void events.push(event),
      delta: async (key, text) =>
        void events.push({ type: "section_delta", key, text }),
      flush: async () => {},
    }),
    ask: async (size, givenSchema) => {
      const schema: unknown = givenSchema;
      asked.push(
        `${size}:${schema === IdentifyAnswer ? "identify" : "outline"}`,
      );
      if (schema === IdentifyAnswer)
        return (answers.identify ?? (() => ZOD_ANSWER))() as never;
      return (answers.outline ?? (() => ({ sections: [] })))() as never;
    },
    write: async (messages, onToken) => {
      written.push({ messages });
      const user = String((messages[1] as { content: string }).content);
      const sources = (user.match(/=== SOURCE \[\d+\]/g) ?? []).length;
      const text =
        answers.text?.(sources, user.includes("Problems found:")) ??
        "Use `z.string()` to start [1]. It is typed [1].";
      for (const piece of text.match(/[\s\S]{1,12}/g) ?? [])
        await onToken(piece);
      return text;
    },
    searchWeb: async (query) => {
      searches.push(query);
      return answers.hits ?? ZOD_HITS;
    },
    discoverDocs: async () => ({
      source: "llms.txt",
      pages: answers.pages ?? ZOD_PAGES,
      truncated: false,
      attempts: [
        { source: "llms.txt", pages: (answers.pages ?? ZOD_PAGES).length },
      ],
    }),
    fetchPage: async (url) => {
      fetched.push(url);
      if (answers.brokenUrls?.includes(url)) throw new Error("HTTP 500");
      const title = url.split("/").filter(Boolean).pop() ?? "Home";
      return {
        requestedUrl: url,
        url,
        status: 200,
        contentType: "text/markdown",
        body: pageBody(title),
        bytes: 1000,
        redirects: [],
        fetchedAt: new Date(),
      };
    },
    saveTechnology: async (input) => {
      saved.push(input);
      return "tech-1";
    },
    saveGuide: async (input) => {
      guides.push(input);
      return { guideId: "guide-1", versionId: "version-1", versionNo: 1 };
    },
    storeChunks: async (input) => {
      if (answers.storeFails) throw new Error("embeddings are down");
      stored.push(input);
      return { total: 1, inserted: 1, skipped: 0, tokens: 10 } as never;
    },
  };
  return {
    deps,
    events,
    searches,
    asked,
    saved,
    fetched,
    stored,
    written,
    guides,
  };
}

/** A starting state for calling one node directly. */
export function stateWith(
  overrides: Partial<GenerateStateType> = {},
): GenerateStateType {
  return {
    runId: "run-1",
    query: "zod",
    chosenUrl: null,
    technology: null,
    candidates: [],
    discoveredPages: [],
    outline: [],
    sections: {},
    checkAttempts: {},
    guideId: null,
    versionId: null,
    budget: newBudget(),
    ...overrides,
  };
}
