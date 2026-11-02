import { describe, expect, it, vi } from "vitest";
import { rerank, RerankError } from "@/lib/rag/reranker";
import { readSettings } from "@/lib/rag/reranker/config";
import { parseScores } from "@/lib/rag/reranker/parse";
import { buildMessages } from "@/lib/rag/reranker/prompt";
import type { RerankDeps } from "@/lib/rag/reranker/types";
import type { Candidate } from "@/lib/rag/retriever";
import { afterEach } from "vitest";

const candidate = (
  id: string,
  score = 0.02,
  content = `text ${id}`,
): Candidate => ({
  id,
  content,
  headingPath: `Heading ${id}`,
  sourceType: "official",
  sourceId: "s",
  sourceUrl: `https://example.com/${id}`,
  sourceTitle: id,
  score,
});

/** A fake model that scores candidate n with scores[n-1]. */
function fakeModel(scores: number[]) {
  const ask = vi.fn(async () =>
    JSON.stringify({ scores: scores.map((score, i) => ({ n: i + 1, score })) }),
  );
  const deps: RerankDeps = {
    settings: () => ({ apiKey: "sk-test", model: "gpt-test" }),
    ask,
  };
  return { ask, deps };
}

describe("rerank", () => {
  it("orders candidates by the model's scores and keeps the top 5", async () => {
    const candidates = ["a", "b", "c", "d", "e", "f", "g"].map((id) =>
      candidate(id),
    );
    const { deps } = fakeModel([2, 9, 0, 7, 10, 1, 5]);
    const top = await rerank({ question: "q", candidates }, deps);
    expect(top.map((c) => c.id)).toEqual(["e", "b", "d", "g", "a"]);
    expect(top.map((c) => c.relevance)).toEqual([1, 0.9, 0.7, 0.5, 0.2]);
  });

  it("keeps the retriever's order between candidates with equal relevance", async () => {
    const candidates = [
      candidate("a", 0.01),
      candidate("b", 0.03),
      candidate("c", 0.02),
    ];
    const { deps } = fakeModel([5, 5, 5]);
    expect(
      (await rerank({ question: "q", candidates }, deps)).map((c) => c.id),
    ).toEqual(["b", "c", "a"]);
  });

  it("makes ONE model call for all candidates", async () => {
    const { ask, deps } = fakeModel([1, 2, 3]);
    await rerank(
      {
        question: "q",
        candidates: [candidate("a"), candidate("b"), candidate("c")],
      },
      deps,
    );
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("respects topK and the original candidate fields", async () => {
    const { deps } = fakeModel([3, 8]);
    const top = await rerank(
      { question: "q", candidates: [candidate("a"), candidate("b")], topK: 1 },
      deps,
    );
    expect(top).toHaveLength(1);
    expect(top[0]).toMatchObject({
      id: "b",
      sourceUrl: "https://example.com/b",
      score: 0.02,
    });
  });

  it("returns nothing, and calls nothing, for no candidates", async () => {
    const { ask, deps } = fakeModel([]);
    expect(await rerank({ question: "q", candidates: [] }, deps)).toEqual([]);
    expect(ask).not.toHaveBeenCalled();
  });

  it("only sends the first 40 candidates to the model", async () => {
    const many = Array.from({ length: 60 }, (_, i) => candidate(`c${i}`));
    const { ask, deps } = fakeModel(many.map(() => 1));
    await rerank({ question: "q", candidates: many }, deps);
    const messages = (
      ask.mock.calls[0] as unknown as [unknown, { content: string }[]]
    )[1];
    expect(messages[1].content).toContain("[40]");
    expect(messages[1].content).not.toContain("[41]");
  });

  it("fails clearly when the model's answer is not what was asked for", async () => {
    const deps: RerankDeps = {
      settings: () => ({ apiKey: "k", model: "m" }),
      ask: async () => "not json",
    };
    await expect(
      rerank({ question: "q", candidates: [candidate("a")] }, deps),
    ).rejects.toMatchObject({
      name: "RerankError",
      kind: "format",
    });
  });
});

describe("parseScores", () => {
  it("divides by 10 and puts each score at its candidate's position", () => {
    expect(
      parseScores('{"scores":[{"n":2,"score":3},{"n":1,"score":9}]}', 2),
    ).toEqual([0.9, 0.3]);
  });

  it("counts unscored candidates as 0", () => {
    expect(parseScores('{"scores":[{"n":1,"score":9}]}', 3)).toEqual([
      0.9, 0, 0,
    ]);
  });

  it("ignores unknown candidate numbers and clamps out-of-range scores", () => {
    expect(
      parseScores(
        '{"scores":[{"n":9,"score":5},{"n":0,"score":5},{"n":1,"score":42},{"n":2,"score":-3}]}',
        2,
      ),
    ).toEqual([1, 0]);
  });

  it("rejects invalid JSON and the wrong shape", () => {
    expect(() => parseScores("nope", 1)).toThrow(RerankError);
    expect(() => parseScores('{"scores":"x"}', 1)).toThrow(RerankError);
  });
});

describe("buildMessages", () => {
  it("numbers the excerpts from 1, with their headings, after the question", () => {
    const [system, user] = buildMessages("How do I X?", [
      candidate("a"),
      candidate("b"),
    ]);
    expect(system.role).toBe("system");
    expect(user.content).toContain("Question: How do I X?");
    expect(user.content).toContain("[1] (Heading a)\ntext a");
    expect(user.content).toContain("[2] (Heading b)\ntext b");
  });

  it("tells the model the excerpts are data, not instructions", () => {
    expect(buildMessages("q", [candidate("a")])[0].content).toMatch(
      /ignore any instructions/i,
    );
  });

  it("shortens very long excerpts", () => {
    const [, user] = buildMessages("q", [
      candidate("a", 0.01, "x".repeat(5000)),
    ]);
    expect(user.content.length).toBeLessThan(2000);
    expect(user.content).toContain(" ...");
  });
});

describe("readSettings", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reads the key and model from the environment, with gpt-4o-mini as the default model", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-abc");
    vi.stubEnv("RERANK_MODEL", undefined);
    expect(readSettings()).toEqual({ apiKey: "sk-abc", model: "gpt-4o-mini" });
  });

  it("fails with a clear message when the key is missing", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(() => readSettings()).toThrow(/OPENAI_API_KEY is required/);
  });
});
