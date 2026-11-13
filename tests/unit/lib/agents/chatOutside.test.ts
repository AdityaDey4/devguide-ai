import { describe, expect, it } from "vitest";
import { buildChatGraph } from "@/lib/agents/chat/graph";
import { context7 } from "@/lib/agents/chat/nodes/context7";
import { liveFetch } from "@/lib/agents/chat/nodes/liveFetch";
import { mergeAndRerank } from "@/lib/agents/chat/nodes/mergeAndRerank";
import {
  MAX_EXTERNAL_CHUNKS,
  NOT_COVERED,
  LIVE_MAX_CHARS,
  LIVE_PAGES,
} from "@/lib/agents/chat/config";
import {
  chatStateWith,
  fakeChatDeps,
  longPage,
  ranked,
} from "../../../helpers/chatFakes";

// Looking outside the stored text (SRS FR-CHAT-6, FR-CHAT-7): Context7 and the live lookup in the
// official docs, putting the results together with what was kept, and the graph that runs it all
// only when the first grade says the stored text is not enough. Fakes for everything outside.

const missing = { verdict: "PARTIAL" as const, missing: "z.url options" };
const withMissing = chatStateWith({ grade: missing, chunks: [ranked()] });

describe("context7", () => {
  it("asks Context7 for what is missing, and keeps the snippets as outside text", async () => {
    const { deps, snippetQueries } = fakeChatDeps({
      snippets: [
        {
          title: "Validate a URL",
          url: "https://github.com/colinhacks/zod/blob/main/a.md",
          markdown: "Use `z.url()`.",
        },
      ],
    });
    const update = await context7(withMissing, deps);

    expect(snippetQueries).toEqual([{ name: "Zod", topic: "z.url options" }]);
    expect(update.external).toEqual([
      {
        url: "https://github.com/colinhacks/zod/blob/main/a.md",
        title: "Validate a URL",
        type: "context7",
        markdown: "Use `z.url()`.",
      },
    ]);
  });

  it("gives an empty list when Context7 has nothing", async () => {
    const { deps } = fakeChatDeps();
    expect((await context7(withMissing, deps)).external).toEqual([]);
  });
});

describe("liveFetch", () => {
  const hit = (url: string) => ({ title: "t", url, content: "" });

  it("searches only the official site for what is missing, then reads the best pages", async () => {
    const { deps, searches, fetched } = fakeChatDeps({
      hits: [
        hit("https://zod.dev/api"),
        hit("https://other.example/zod"), // not the official site: never downloaded
        hit("https://zod.dev/basics"),
        hit("https://zod.dev/third"), // more than LIVE_PAGES
      ],
      pages: { "https://zod.dev/api": longPage("Defining schemas") },
    });
    const update = await liveFetch(withMissing, deps);

    expect(searches).toEqual([
      { query: "Zod z.url options", domains: ["zod.dev"] },
    ]);
    expect(fetched).toEqual(["https://zod.dev/api", "https://zod.dev/basics"]);
    expect(fetched).toHaveLength(LIVE_PAGES);
    expect(update.external).toHaveLength(2);
    expect(update.external?.[0]).toMatchObject({
      url: "https://zod.dev/api",
      type: "official",
      title: "Defining schemas",
    });
  });

  it("cuts a very long page, and skips a page with next to no text", async () => {
    const { deps } = fakeChatDeps({
      hits: [hit("https://zod.dev/long"), hit("https://zod.dev/empty")],
      pages: {
        "https://zod.dev/long": `# Long\n\n${"word ".repeat(LIVE_MAX_CHARS)}`,
        "https://zod.dev/empty": "# Empty\n\nshort",
      },
    });
    const update = await liveFetch(withMissing, deps);
    expect(update.external).toHaveLength(1);
    expect(update.external?.[0].markdown.length).toBeLessThanOrEqual(
      LIVE_MAX_CHARS,
    );
  });

  it("loses only the page that fails to download", async () => {
    const { deps } = fakeChatDeps({
      hits: [hit("https://zod.dev/a"), hit("https://zod.dev/b")],
      brokenUrls: ["https://zod.dev/a"],
    });
    const update = await liveFetch(withMissing, deps);
    expect(update.external?.map((d) => d.url)).toEqual(["https://zod.dev/b"]);
  });

  it("gives an empty list, without failing, when the search is down", async () => {
    const { deps } = fakeChatDeps({ searchFails: true });
    expect((await liveFetch(withMissing, deps)).external).toEqual([]);
  });

  it("does nothing when the technology's docs site is not known", async () => {
    const { deps, searches } = fakeChatDeps();
    const state = chatStateWith({
      grade: missing,
      technology: {
        id: "t1",
        name: "Zod",
        version: null,
        docsUrl: null,
        officialUrl: null,
      },
    });
    expect((await liveFetch(state, deps)).external).toEqual([]);
    expect(searches).toEqual([]);
  });
});

describe("mergeAndRerank", () => {
  const doc = (markdown: string, over = {}) => ({
    url: "https://zod.dev/api",
    title: "Defining schemas",
    type: "official" as const,
    markdown,
    ...over,
  });

  it("ranks the kept chunks and the new text together, in memory", async () => {
    const { deps, reranked } = fakeChatDeps();
    const kept = ranked({ id: "kept", content: "KEPT TEXT" });
    const update = await mergeAndRerank(
      chatStateWith({
        chunks: [kept],
        external: [doc("# Strings\n\nNEW TEXT about z.url options.")],
      }),
      deps,
    );

    expect(reranked).toHaveLength(1);
    expect(reranked[0][0].id).toBe("kept"); // the kept ones come first
    const fresh = reranked[0].slice(1);
    expect(fresh.map((c) => c.content).join(" ")).toContain("NEW TEXT");
    expect(fresh[0]).toMatchObject({
      sourceType: "official",
      sourceId: null,
      sourceUrl: "https://zod.dev/api",
      sourceTitle: "Defining schemas",
    });
    expect(update.chunks?.length).toBeGreaterThan(1);
  });

  it("drops what the reranker finds weak, and text already among the kept chunks", async () => {
    const { deps, reranked } = fakeChatDeps();
    deps.rerank = async ({ candidates }) =>
      candidates.map((c, i) => ({
        ...ranked(),
        ...c,
        relevance: i === 0 ? 0.9 : 0.1,
      }));
    const kept = ranked({ content: "Use z.url() here." });
    const update = await mergeAndRerank(
      chatStateWith({
        chunks: [kept],
        external: [
          doc("Use z.url() here."),
          doc("Another page.", { url: "https://zod.dev/b" }),
        ],
      }),
      deps,
    );
    expect(reranked).toEqual([]); // (the fake above replaced the recording one)
    expect(update.chunks).toHaveLength(1);
    expect(update.chunks?.[0].content).toBe("Use z.url() here.");
  });

  it("sends the reranker no more than the allowed number of new chunks", async () => {
    const { deps, reranked } = fakeChatDeps();
    const big = Array.from(
      { length: 200 },
      (_, i) =>
        `## Part ${i}\n\n${`Part ${i} says something distinct. `.repeat(30)}`,
    ).join("\n\n");
    await mergeAndRerank(
      chatStateWith({ chunks: [ranked()], external: [doc(big)] }),
      deps,
    );
    expect(reranked[0].length - 1).toBe(MAX_EXTERNAL_CHUNKS);
  });

  it("with nothing new leaves the chunks as they are and asks no reranker", async () => {
    const { deps, reranked } = fakeChatDeps();
    const update = await mergeAndRerank(
      chatStateWith({ chunks: [ranked()], external: [] }),
      deps,
    );
    expect(update).toEqual({});
    expect(reranked).toEqual([]);
  });
});

describe("the chat graph with outside lookups", () => {
  const input = {
    technology: chatStateWith().technology,
    guideId: "g1",
    history: [],
    question: "How do I validate a URL?",
  };
  const run = (deps: ReturnType<typeof fakeChatDeps>["deps"]) =>
    buildChatGraph(() => {}, deps).invoke(input);

  it("a GOOD grade goes straight to the answer: no Context7, no web", async () => {
    const f = fakeChatDeps({
      found: [ranked()],
      grade: { verdict: "GOOD", missing: "" },
    });
    await run(f.deps);
    expect(f.snippetQueries).toEqual([]);
    expect(f.searches).toEqual([]);
    expect(f.grades).toHaveLength(1);
  });

  it("PARTIAL runs both lookups, merges, grades again, and answers from the merged chunks", async () => {
    const f = fakeChatDeps({
      found: [ranked({ content: "STORED" })],
      grade: missing,
      regrade: { verdict: "GOOD", missing: "" },
      snippets: [
        {
          title: "Snippet",
          url: "https://github.com/x/y/a.md",
          markdown: "Use z.url() with options.",
        },
      ],
      hits: [{ title: "t", url: "https://zod.dev/api", content: "" }],
      text: "Done [1].",
    });
    const result = await run(f.deps);

    expect(f.snippetQueries).toEqual([{ name: "Zod", topic: "z.url options" }]);
    expect(f.searches).toHaveLength(1);
    expect(f.fetched).toEqual(["https://zod.dev/api"]);
    expect(f.reranked).toHaveLength(2); // the first search, then the merge
    expect(f.grades).toHaveLength(2); // before and after the lookups
    // the second grade saw the merged text, not only the stored chunk
    expect(JSON.stringify(f.grades[1])).toContain("Use z.url() with options.");
    expect(result.reply).toBe("Done [1].");
  });

  it("looks outside only once, even when the second grade is still BAD", async () => {
    const f = fakeChatDeps({
      found: [ranked()],
      grade: { verdict: "BAD", missing: "x" },
      regrade: { verdict: "BAD", missing: "x" },
    });
    const result = await run(f.deps);
    expect(f.snippetQueries).toHaveLength(1);
    expect(f.searches).toHaveLength(1);
    expect(result.grade).toEqual({ verdict: "BAD", missing: "x" });
    // still BAD after looking outside: the honest reply, written by no model
    expect(result.reply).toBe(NOT_COVERED);
    expect(f.written).toEqual([]);
  });

  it("an outside lookup that finds nothing does not stop the answer", async () => {
    const f = fakeChatDeps({
      found: [ranked()],
      grade: missing,
      searchFails: true,
      text: "From stored text [1].",
    });
    const result = await run(f.deps);
    expect(result.reply).toBe("From stored text [1].");
  });
});
