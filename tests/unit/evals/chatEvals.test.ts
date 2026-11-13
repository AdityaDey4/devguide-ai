import { describe, expect, it } from "vitest";
import { judge, percentiles, summarise } from "../../../evals/chat/judge";
import { loadChatQuestions } from "../../../evals/chat/load";
import { buildChatReport } from "../../../evals/chat/report";
import type { Asked, ChatQuestion } from "../../../evals/chat/types";

// The chat evals' own logic (not the chat): is an answer judged right, and are the numbers
// added up right? If this were wrong the eval would give confident nonsense.

const answerable: ChatQuestion = {
  id: "q1",
  technology: "nodejs",
  group: "outside",
  question: "How do I write to a file?",
  expected: ["fetched_now"],
  mentions: ["writeFile"],
};
const refused: ChatQuestion = {
  id: "q2",
  technology: "nodejs",
  group: "not_found",
  question: "How do I bake bread?",
  expected: ["not_found"],
};
const stored: ChatQuestion = {
  id: "q3",
  technology: "java",
  group: "stored",
  question: "How do I install the JDK?",
  expected: ["guide", "stored_docs"],
  mentions: ["JDK"],
};

const asked = (over: Partial<Asked> = {}): Asked => ({
  origin: "fetched_now",
  grade: "GOOD",
  reply: "Use fs.writeFile(...) [1].",
  cited: ["fs docs"],
  calls: { context7: 1, search: 1, fetch: 2 },
  firstTokenMs: 9000,
  totalMs: 12000,
  ...over,
});

describe("judge", () => {
  it("passes an answer with the right origin, a citation and an expected word", () => {
    const j = judge(answerable, asked());
    expect(j).toMatchObject({
      originOk: true,
      mentionsOk: true,
      citedOk: true,
      pass: true,
    });
  });

  it("fails the wrong origin, even if the text looks fine", () => {
    expect(judge(answerable, asked({ origin: "stored_docs" })).pass).toBe(
      false,
    );
  });

  it("accepts any of several expected origins", () => {
    expect(
      judge(stored, asked({ origin: "guide", reply: "Get the JDK [1]." })).pass,
    ).toBe(true);
    expect(
      judge(stored, asked({ origin: "stored_docs", reply: "Get the JDK [1]." }))
        .pass,
    ).toBe(true);
    expect(
      judge(stored, asked({ origin: "fetched_now", reply: "JDK [1]." })).pass,
    ).toBe(false);
  });

  it("fails an answer that uses none of the expected words, case aside", () => {
    expect(
      judge(answerable, asked({ reply: "Use something else [1]." })).mentionsOk,
    ).toBe(false);
    expect(
      judge(answerable, asked({ reply: "use FS.WRITEFILE [1]." })).mentionsOk,
    ).toBe(true);
  });

  it("fails an answer with no citations", () => {
    const j = judge(answerable, asked({ cited: [] }));
    expect(j.citedOk).toBe(false);
    expect(j.pass).toBe(false);
  });

  it("a refusal passes with origin not_found, and needs no words or citations", () => {
    const j = judge(
      refused,
      asked({ origin: "not_found", reply: "I couldn't find it.", cited: [] }),
    );
    expect(j).toMatchObject({
      originOk: true,
      mentionsOk: null,
      citedOk: null,
      pass: true,
    });
  });

  it("a refused question that gets answered fails", () => {
    expect(judge(refused, asked()).pass).toBe(false);
  });

  it("a graph error always fails, even when the error left the default origin not_found", () => {
    const j = judge(
      refused,
      asked({ origin: "not_found", error: "boom", cited: [] }),
    );
    expect(j.originOk).toBe(false);
    expect(j.pass).toBe(false);
  });
});

describe("summarise", () => {
  const judged = [
    judge(answerable, asked()), // right
    judge(
      answerable,
      asked({ origin: "not_found", reply: "I couldn't find it.", cited: [] }),
    ), // false refusal
    judge(refused, asked()), // invented
    judge(refused, asked({ origin: "not_found", reply: "none", cited: [] })), // right
    judge(
      stored,
      asked({
        origin: "stored_docs",
        reply: "the JDK [1]",
        calls: { context7: 0, search: 0, fetch: 0 },
      }),
    ), // right, no outside
    judge(stored, asked({ origin: "stored_docs", reply: "the JDK [1]" })), // right but went outside
    judge(stored, asked({ error: "boom", origin: "not_found" })), // error
  ];
  const s = summarise(judged);

  it("counts passes, origins and errors", () => {
    expect(s.total).toBe(7);
    expect(s.passed).toBe(4);
    expect(s.originRight).toBe(4);
    expect(s.errors).toBe(1);
  });

  it("separates the two kinds of mistake, and does not count errors as either", () => {
    expect(s.falseRefusals).toBe(1);
    expect(s.invented).toBe(1);
  });

  it("counts stored-text questions that went outside anyway", () => {
    expect(s.needlesslyOutside).toBe(2); // the one that went outside and the errored one that counted calls
  });

  it("counts the groups", () => {
    expect(s.byGroup.outside).toEqual({ total: 2, originRight: 1 });
    expect(s.byGroup.not_found).toEqual({ total: 2, originRight: 1 });
    expect(s.byGroup.stored).toEqual({ total: 3, originRight: 2 });
  });
});

describe("percentiles", () => {
  it("gives the median and the 90th percentile by nearest rank", () => {
    expect(percentiles([5, 1, 3, 2, 4, 10, 9, 8, 7, 6])).toEqual({
      p50: 5,
      p90: 9,
    });
  });
  it("is zero for nothing, and the value itself for one value", () => {
    expect(percentiles([])).toEqual({ p50: 0, p90: 0 });
    expect(percentiles([7])).toEqual({ p50: 7, p90: 7 });
  });
});

describe("the real question set", () => {
  const questions = loadChatQuestions("evals/chat/questions.jsonl");

  it("has 15 to 20 questions with unique ids", () => {
    expect(questions.length).toBeGreaterThanOrEqual(15);
    expect(questions.length).toBeLessThanOrEqual(20);
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
  });

  it("covers all three kinds of question, on more than one technology", () => {
    expect(new Set(questions.map((q) => q.group))).toEqual(
      new Set(["stored", "outside", "not_found"]),
    );
    expect(new Set(questions.map((q) => q.technology)).size).toBeGreaterThan(1);
  });

  it("expects what its group says", () => {
    for (const q of questions) {
      if (q.group === "not_found") expect(q.expected).toEqual(["not_found"]);
      if (q.group === "outside") expect(q.expected).toEqual(["fetched_now"]);
      if (q.group === "stored") expect(q.expected).not.toContain("fetched_now");
    }
  });
});

describe("buildChatReport", () => {
  it("names the numbers and lists what failed with its answer", () => {
    const report = buildChatReport(
      [
        judge(answerable, asked()),
        judge(refused, asked({ reply: "Knead the dough [1]." })),
      ],
      "2026-11-13",
    );
    expect(report).toContain("# Chat evals");
    expect(report).toContain("Invented answers");
    expect(report).toContain("| q1 |");
    expect(report).toContain("## Needs a look (1)");
    expect(report).toContain("Knead the dough");
  });
});
