import { describe, expect, it } from "vitest";
import { askGuide } from "@/lib/agents/chat";
import {
  DIRECT_REPLIES,
  MIN_RELEVANCE,
  NOT_COVERED,
} from "@/lib/agents/chat/config";
import { answer } from "@/lib/agents/chat/nodes/answer";
import { retrieve } from "@/lib/agents/chat/nodes/retrieve";
import { contentHash } from "@/lib/rag/store";
import { understand } from "@/lib/agents/chat/nodes/understand";
import {
  chatStateWith,
  fakeChatDeps,
  ranked,
} from "../../../helpers/chatFakes";

// The chat graph (SRS FR-CHAT-1 to FR-CHAT-3, FR-CHAT-8, FR-CHAT-10), with fake model, search and
// reranker: what each step asks, what it passes on, and what the person finally gets.

const text = (messages: unknown[]) =>
  messages.map((m) => (m as { content: string }).content).join("\n");

describe("understand", () => {
  it("gives the model the question and only the last 6 messages", async () => {
    const { deps, asked } = fakeChatDeps();
    const history = Array.from({ length: 8 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `message-${i}`,
    }));
    await understand(chatStateWith({ history }), deps);

    const sent = text(asked[0]);
    expect(sent).toContain("Latest question: and a URL?");
    expect(sent).not.toContain("message-1");
    expect(sent).toContain("message-2");
    expect(sent).toContain("message-7");
  });

  it("returns the standalone question and the variants", async () => {
    const { deps } = fakeChatDeps({
      standalone: "How do I validate a URL with Zod?",
      variants: ["z.url"],
    });
    expect(await understand(chatStateWith(), deps)).toEqual({
      intent: "question",
      standaloneQuery: "How do I validate a URL with Zod?",
      variants: ["z.url"],
    });
  });

  it("falls back to the question itself when the rewrite is empty", async () => {
    const { deps } = fakeChatDeps({ standalone: "  " });
    const update = await understand(chatStateWith(), deps);
    expect(update.standaloneQuery).toBe("and a URL?");
  });
});

describe("retrieve", () => {
  it("searches only this technology and guide, with the question and its variants", async () => {
    const { deps, retrieved } = fakeChatDeps();
    await retrieve(chatStateWith({ variants: ["z.url", "url check"] }), deps);
    expect(retrieved).toEqual([
      {
        technologyId: "t1",
        guideId: "g1",
        queries: ["How do I validate a URL with Zod?", "z.url", "url check"],
      },
    ]);
  });

  it("leaves the guide out of the search when there is none", async () => {
    const { deps, retrieved } = fakeChatDeps();
    await retrieve(chatStateWith({ guideId: null }), deps);
    expect("guideId" in retrieved[0]).toBe(false);
  });

  it("on a person's copy, also searches the shared guide and ignores shared passages the copy replaced", async () => {
    const old = "Old text the person rewrote.";
    const { deps, retrieved, reranked } = fakeChatDeps({
      found: [ranked({ id: "old", content: old }), ranked({ id: "new" })],
    });
    await retrieve(
      chatStateWith({
        guideId: "mine",
        alsoGuideId: "shared",
        hiddenHashes: [contentHash(old)],
      }),
      deps,
    );
    expect(retrieved[0]).toMatchObject({
      guideId: "mine",
      alsoGuideId: "shared",
    });
    expect(reranked[0].map((c) => c.id)).toEqual(["new"]);
  });

  it("drops chunks the reranker found weak", async () => {
    const { deps } = fakeChatDeps({
      found: [
        ranked({ id: "good", relevance: 0.9 }),
        ranked({ id: "edge", relevance: MIN_RELEVANCE }),
        ranked({ id: "weak", relevance: MIN_RELEVANCE - 0.1 }),
      ],
    });
    const update = await retrieve(chatStateWith(), deps);
    expect(update.chunks?.map((c) => c.id)).toEqual(["good", "edge"]);
  });
});

describe("answer", () => {
  it("numbers the excerpts for the model and tells it to use only them", async () => {
    const { deps, written } = fakeChatDeps();
    await answer(
      chatStateWith({
        chunks: [
          ranked({ content: "FIRST TEXT" }),
          ranked({ content: "SECOND TEXT", sourceUrl: null }),
        ],
      }),
      deps,
      () => {},
    );
    const sent = text(written[0]);
    expect(sent).toContain("EXCERPT [1]");
    expect(sent).toContain("EXCERPT [2]");
    expect(sent).toContain("FIRST TEXT");
    expect(sent).toContain("ONLY the numbered excerpts");
  });

  it("streams the text and reports the sources it cited, in the excerpt order", async () => {
    const { deps } = fakeChatDeps({
      text: "Use `z.url()` [2]. Also see [1][2].",
    });
    const pieces: string[] = [];
    const update = await answer(
      chatStateWith({
        chunks: [
          ranked({
            sourceTitle: "Guide text",
            sourceUrl: null,
            sourceType: "guide",
          }),
          ranked({ sourceTitle: "Defining schemas" }),
        ],
      }),
      deps,
      (piece) => void pieces.push(piece),
    );

    expect(pieces.join("")).toBe(update.reply);
    expect(pieces.length).toBeGreaterThan(1); // really in pieces
    expect(update.citations).toEqual([
      { n: 1, title: "Guide text", url: null, kind: "guide" },
      {
        n: 2,
        title: "Defining schemas",
        url: "https://zod.dev/api",
        kind: "docs",
      },
    ]);
  });

  it("does not report a citation number that matches no excerpt", async () => {
    const { deps } = fakeChatDeps({ text: "Something [1] and invented [7]." });
    const update = await answer(
      chatStateWith({ chunks: [ranked()] }),
      deps,
      () => {},
    );
    expect(update.citations?.map((c) => c.n)).toEqual([1]);
  });

  it("a BAD grade gives the honest reply without asking the model, even when chunks are left", async () => {
    const { deps, written } = fakeChatDeps();
    const pieces: string[] = [];
    const update = await answer(
      chatStateWith({
        chunks: [ranked()],
        grade: { verdict: "BAD", missing: "z.url options" },
      }),
      deps,
      (piece) => void pieces.push(piece),
    );
    expect(written).toEqual([]);
    expect(update).toEqual({
      reply: NOT_COVERED,
      citations: [],
      origin: "not_found",
    });
    expect(pieces.join("")).toBe(NOT_COVERED);
  });

  it("a PARTIAL grade tells the model what is not covered, so the answer says it", async () => {
    const { deps, written } = fakeChatDeps();
    await answer(
      chatStateWith({
        chunks: [ranked()],
        grade: { verdict: "PARTIAL", missing: "z.url options" },
      }),
      deps,
      () => {},
    );
    const sent = text(written[0]);
    expect(sent).toContain("cover only part of this question");
    expect(sent).toContain("Not covered: z.url options");
  });

  it("a GOOD grade adds no such note", async () => {
    const { deps, written } = fakeChatDeps();
    await answer(
      chatStateWith({
        chunks: [ranked()],
        grade: { verdict: "GOOD", missing: "" },
      }),
      deps,
      () => {},
    );
    expect(text(written[0])).not.toContain("Not covered");
  });

  it("with no chunks says it does not know, without asking the model", async () => {
    const { deps, written } = fakeChatDeps();
    const pieces: string[] = [];
    const update = await answer(
      chatStateWith({ chunks: [] }),
      deps,
      (p) => void pieces.push(p),
    );
    expect(written).toEqual([]);
    expect(update).toEqual({
      reply: NOT_COVERED,
      citations: [],
      origin: "not_found",
    });
    expect(pieces.join("")).toBe(NOT_COVERED);
  });
});

describe("a message that is not a question about the technology", () => {
  const zod = {
    id: "t1",
    name: "Zod",
    version: null,
    docsUrl: null,
    officialUrl: null,
  };
  const ask = (intent: "greeting" | "unclear" | "other_topic") => {
    const fake = fakeChatDeps({
      intent,
      found: [ranked()],
      text: "should never be written",
    });
    const pieces: string[] = [];
    return {
      ...fake,
      pieces,
      run: (question: string) =>
        askGuide(
          { technology: zod, guideId: "g1", history: [], question },
          (piece) => void pieces.push(piece),
          fake.deps,
        ),
    };
  };

  it.each([
    ["greeting", "Hi"],
    ["unclear", "kfjrkferljk"],
    ["other_topic", "What is Java"],
  ] as const)(
    "%s (%s) gets a short fixed reply, with nothing searched, graded or written",
    async (intent, message) => {
      const { run, asked, retrieved, written, pieces } = ask(intent);
      const result = await run(message);

      expect(result.answer).toBe(DIRECT_REPLIES[intent]("Zod"));
      expect(pieces.join("")).toBe(result.answer);
      expect(result.citations).toEqual([]);
      expect(result.origin).toBe("none");
      expect(result.toStore).toEqual([]);
      expect(asked).toHaveLength(1); // only the understand step
      expect(retrieved).toHaveLength(0);
      expect(written).toHaveLength(0);
    },
  );

  it("names the technology and never mentions another one", () => {
    for (const reply of Object.values(DIRECT_REPLIES)) {
      expect(reply("Zod")).toContain("Zod");
    }
  });

  it("tells the model what each intent means and to keep follow-ups as questions", async () => {
    const { deps, asked } = fakeChatDeps();
    await understand(chatStateWith({ question: "and a URL?" }), deps);
    const prompt = text(asked[0]);
    for (const intent of ["question", "greeting", "unclear", "other_topic"]) {
      expect(prompt).toContain(`"${intent}"`);
    }
    expect(prompt).toContain("Zod"); // the technology is named in the rules
    expect(prompt).toContain("and a URL?");
  });
});

describe("askGuide (the whole graph)", () => {
  it("understands, searches, then answers with citations", async () => {
    const { deps, asked, retrieved } = fakeChatDeps({
      found: [ranked()],
      text: "Use `z.url()` [1].",
    });
    const pieces: string[] = [];
    const result = await askGuide(
      {
        technology: {
          id: "t1",
          name: "Zod",
          version: null,
          docsUrl: null,
          officialUrl: null,
        },
        guideId: "g1",
        history: [{ role: "user", content: "How do I validate an email?" }],
        question: "and a URL?",
      },
      (piece) => void pieces.push(piece),
      deps,
    );

    expect(asked).toHaveLength(2); // understand, then grade (GOOD: no second grade)
    expect(retrieved[0].technologyId).toBe("t1");
    expect(result.answer).toBe("Use `z.url()` [1].");
    expect(pieces.join("")).toBe(result.answer);
    expect(result.citations).toEqual([
      {
        n: 1,
        title: "Defining schemas",
        url: "https://zod.dev/api",
        kind: "docs",
      },
    ]);
  });

  it("a question nothing stored answers gets the honest reply and no citations", async () => {
    const { deps, written } = fakeChatDeps({ found: [] });
    const result = await askGuide(
      {
        technology: {
          id: "t1",
          name: "Zod",
          version: null,
          docsUrl: null,
          officialUrl: null,
        },
        history: [],
        question: "How do I bake bread?",
      },
      () => {},
      deps,
    );
    expect(written).toEqual([]);
    expect(result).toEqual({
      answer: NOT_COVERED,
      citations: [],
      origin: "not_found",
      cached: false,
      standaloneQuery: "How do I validate a URL with Zod?",
      grade: "BAD",
      toStore: [],
    });
  });
});

describe("the answer cache in the graph", () => {
  const input = {
    technology: chatStateWith().technology,
    guideId: "g1",
    history: [],
    question: "and a URL?",
  };
  const saved = {
    answer: "Saved: use `z.url()` [1].",
    citations: [
      {
        n: 1,
        title: "Strings",
        url: "https://zod.dev/api",
        kind: "docs" as const,
      },
    ],
    origin: "stored_docs" as const,
  };

  it("answers from the saved answer and searches, grades and writes nothing", async () => {
    const f = fakeChatDeps({ cached: saved, found: [ranked()] });
    const pieces: string[] = [];
    const result = await askGuide(input, (p) => void pieces.push(p), f.deps);

    expect(result).toMatchObject({
      answer: saved.answer,
      citations: saved.citations,
      origin: "stored_docs",
      cached: true,
      toStore: [],
    });
    expect(pieces.join("")).toBe(saved.answer);
    expect(f.retrieved).toEqual([]);
    expect(f.grades).toEqual([]);
    expect(f.written).toEqual([]);
    expect(f.fetched).toEqual([]);
  });

  it("looks up the question as the chat rewrote it, not the raw message", async () => {
    const f = fakeChatDeps({
      cached: saved,
      standalone: "How do I validate a URL with Zod?",
    });
    await askGuide(input, () => {}, f.deps);
    expect(f.cacheLookups).toEqual(["How do I validate a URL with Zod?"]);
  });

  it("carries on with the normal search when nothing is saved", async () => {
    const f = fakeChatDeps({
      cached: null,
      found: [ranked()],
      text: "Fresh answer [1].",
    });
    const result = await askGuide(input, () => {}, f.deps);
    expect(f.cacheLookups).toHaveLength(1);
    expect(f.retrieved).toHaveLength(1);
    expect(result).toMatchObject({
      answer: "Fresh answer [1].",
      cached: false,
    });
  });

  it("does not look in the cache at all when there is none (an edited copy, the evals)", async () => {
    const f = fakeChatDeps({ found: [ranked()] });
    expect(f.deps.lookupCache).toBeUndefined();
    const result = await askGuide(input, () => {}, f.deps);
    expect(f.cacheLookups).toEqual([]);
    expect(result.cached).toBe(false);
  });

  it("does not look in the cache for a greeting", async () => {
    const f = fakeChatDeps({ cached: saved, intent: "greeting" });
    const result = await askGuide(input, () => {}, f.deps);
    expect(f.cacheLookups).toEqual([]);
    expect(result).toMatchObject({ origin: "none", cached: false });
  });
});

describe("what askGuide reports for the cache to save", () => {
  it("gives the rewritten question and the final grade", async () => {
    const f = fakeChatDeps({
      found: [ranked()],
      standalone: "How do I validate a URL with Zod?",
      grade: { verdict: "PARTIAL", missing: "options" },
      regrade: { verdict: "GOOD", missing: "" },
    });
    const result = await askGuide(
      {
        technology: chatStateWith().technology,
        guideId: "g1",
        history: [],
        question: "and a URL?",
      },
      () => {},
      f.deps,
    );
    expect(result).toMatchObject({
      standaloneQuery: "How do I validate a URL with Zod?",
      grade: "GOOD", // after the outside lookups, not the first grade
    });
  });
});
