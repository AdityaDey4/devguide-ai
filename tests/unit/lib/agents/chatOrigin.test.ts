import { describe, expect, it } from "vitest";
import { answer } from "@/lib/agents/chat/nodes/answer";
import { mergeAndRerank } from "@/lib/agents/chat/nodes/mergeAndRerank";
import { buildChatGraph } from "@/lib/agents/chat/graph";
import { FRESH_PREFIX, isFresh, originOf } from "@/lib/agents/chat/origin";
import {
  chatStateWith,
  fakeChatDeps,
  longPage,
  ranked,
} from "../../../helpers/chatFakes";

// Where an answer came from (SRS FR-CHAT-8): guide, stored docs, fetched just now, or not found.
// It follows the chunks the answer cited, so each kind of chunk is tried alone and mixed.

const guideChunk = ranked({
  id: "g",
  sourceType: "guide",
  sourceUrl: null,
  sourceId: null,
});
const storedChunk = ranked({ id: "s", sourceType: "official" });
const context7Chunk = ranked({ id: "c", sourceType: "context7" });
const freshChunk = ranked({ id: `${FRESH_PREFIX}https://zod.dev/api#1` });

describe("originOf", () => {
  it("is guide when only the guide's own text was used", () => {
    expect(originOf([guideChunk])).toBe("guide");
  });

  it("is stored_docs for stored official pages and stored Context7 snippets", () => {
    expect(originOf([storedChunk])).toBe("stored_docs");
    expect(originOf([context7Chunk])).toBe("stored_docs");
    expect(originOf([guideChunk, storedChunk])).toBe("stored_docs");
  });

  it("is fetched_now as soon as any text found just now was used", () => {
    expect(originOf([freshChunk])).toBe("fetched_now");
    expect(originOf([guideChunk, storedChunk, freshChunk])).toBe("fetched_now");
  });

  it("knows a fresh chunk by its id", () => {
    expect(isFresh(freshChunk)).toBe(true);
    expect(isFresh(storedChunk)).toBe(false);
  });
});

describe("answer: origin", () => {
  const origin = async (
    chunks: ReturnType<typeof ranked>[],
    text: string,
    grade: { verdict: "GOOD" | "PARTIAL" | "BAD"; missing: string } | null = {
      verdict: "GOOD",
      missing: "",
    },
  ) => {
    const { deps } = fakeChatDeps({ text });
    return (await answer(chatStateWith({ chunks, grade }), deps, () => {}))
      .origin;
  };

  it("follows what the answer cites, not everything it was given", async () => {
    const chunks = [guideChunk, freshChunk];
    expect(await origin(chunks, "From the guide [1].")).toBe("guide");
    expect(await origin(chunks, "From outside [2].")).toBe("fetched_now");
    expect(await origin(chunks, "Both [1][2].")).toBe("fetched_now");
  });

  it("judges by all the chunks when the answer cites none", async () => {
    expect(await origin([guideChunk, storedChunk], "No markers.")).toBe(
      "stored_docs",
    );
  });

  it("is not_found for the honest reply, whether by BAD or by no chunks", async () => {
    expect(
      await origin([storedChunk], "x", { verdict: "BAD", missing: "y" }),
    ).toBe("not_found");
    expect(await origin([], "x")).toBe("not_found");
  });
});

describe("mergeAndRerank: fresh chunks", () => {
  it("marks the text found just now, and leaves the kept chunks as they were", async () => {
    const { deps } = fakeChatDeps();
    const update = await mergeAndRerank(
      chatStateWith({
        chunks: [storedChunk],
        external: [
          {
            url: "https://zod.dev/api",
            title: "Defining schemas",
            type: "official",
            markdown: longPage("Defining schemas"),
          },
        ],
      }),
      deps,
    );
    const chunks = update.chunks ?? [];
    expect(chunks.find((c) => c.id === "s")).toBeDefined();
    expect(chunks.filter(isFresh).length).toBeGreaterThan(0);
  });
});

describe("the whole graph: origin", () => {
  const input = {
    technology: chatStateWith().technology,
    guideId: "g1",
    history: [],
    question: "How do I validate a URL?",
  };

  it("a question the stored text answers is not fetched_now", async () => {
    const f = fakeChatDeps({
      found: [ranked({ id: "s" })],
      text: "Stored [1].",
    });
    const result = await buildChatGraph(() => {}, f.deps).invoke(input);
    expect(result.origin).toBe("stored_docs");
  });

  it("an answer that uses what the outside lookups found is fetched_now", async () => {
    const f = fakeChatDeps({
      found: [ranked({ id: "s" })],
      grade: { verdict: "PARTIAL", missing: "z.url options" },
      regrade: { verdict: "GOOD", missing: "" },
      snippets: [
        {
          title: "Snippet",
          url: "https://github.com/x/y/a.md",
          markdown: "Use z.url() with options.",
        },
      ],
      text: "From outside [2].",
    });
    const result = await buildChatGraph(() => {}, f.deps).invoke(input);
    expect(result.origin).toBe("fetched_now");
  });

  it("a question nothing answers is not_found", async () => {
    const f = fakeChatDeps({ found: [] });
    const result = await buildChatGraph(() => {}, f.deps).invoke(input);
    expect(result.origin).toBe("not_found");
  });
});
