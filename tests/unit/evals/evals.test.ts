import { describe, expect, it } from "vitest";
import { loadQuestions } from "../../../evals/load";
import {
  firstHitRank,
  hitAtK,
  reciprocalRank,
  summarize,
} from "../../../evals/metrics";
import { buildReport } from "../../../evals/report";
import type { MethodResult, QuestionResult } from "../../../evals/types";

describe("firstHitRank", () => {
  it("is the 1-based position of the first chunk from an expected page", () => {
    expect(firstHitRank(["/b", "/a", "/a"], ["/a"])).toBe(2);
  });

  it("accepts any of several expected pages", () => {
    expect(firstHitRank(["/x", "/c"], ["/a", "/c"])).toBe(2);
  });

  it("is null when no chunk comes from an expected page, or the page is unknown", () => {
    expect(firstHitRank(["/b", null], ["/a"])).toBeNull();
    expect(firstHitRank([], ["/a"])).toBeNull();
  });
});

describe("hitAtK / reciprocalRank / summarize", () => {
  it("counts a hit only within the top 5", () => {
    expect(hitAtK(5)).toBe(true);
    expect(hitAtK(6)).toBe(false);
    expect(hitAtK(null)).toBe(false);
  });

  it("scores 1 / rank, and 0 for a miss", () => {
    expect(reciprocalRank(1)).toBe(1);
    expect(reciprocalRank(4)).toBe(0.25);
    expect(reciprocalRank(null)).toBe(0);
  });

  it("averages Hit@5 and MRR over all questions", () => {
    const { hitAt5, mrr } = summarize([1, 2, null, 7]);
    expect(hitAt5).toBe(0.5);
    expect(mrr).toBeCloseTo((1 + 0.5 + 0 + 1 / 7) / 4);
  });

  it("is zero for no questions instead of dividing by zero", () => {
    expect(summarize([])).toEqual({ hitAt5: 0, mrr: 0 });
  });
});

describe("loadQuestions", () => {
  it("reads the real question set: valid shape, unique ids, 30 to 50 questions", () => {
    const questions = loadQuestions("evals/retrieval.jsonl");
    expect(questions.length).toBeGreaterThanOrEqual(30);
    expect(questions.length).toBeLessThanOrEqual(50);
    expect(new Set(questions.map((q) => q.technology))).toEqual(
      new Set(["zod", "langgraph", "supabase"]),
    );
  });
});

describe("buildReport", () => {
  const result = (rank: number | null): MethodResult => ({ rank, top5: [] });
  const question = (id: string, technology: string, rank: number | null) =>
    ({
      question: { id, technology, question: `Q ${id}?`, expectedUrls: ["/a"] },
      methods: {
        vector: result(rank),
        keyword: result(null),
        hybrid: result(rank),
        "hybrid+rerank": result(rank),
      },
      topRelevance: 0.9,
    }) satisfies QuestionResult;

  it("shows a row per method, a column per technology, and lists the misses", () => {
    const report = buildReport(
      [question("z1", "zod", 1), question("g1", "langgraph", null)],
      "2026-11-02",
    );
    expect(report).toContain("| vector | 50.0% | 0.500 |");
    expect(report).toContain("| keyword | 0.0% | 0.000 |");
    expect(report).toContain("| Method | zod | langgraph |");
    expect(report).toContain("| hybrid+rerank | 100.0% | 0.0% |");
    expect(report).toContain("Missed by hybrid + rerank (1)");
    expect(report).toContain("**g1** Q g1?");
  });
});
