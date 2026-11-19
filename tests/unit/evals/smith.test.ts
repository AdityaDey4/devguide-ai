import { describe, expect, it } from "vitest";
import { fromExample, scoreRun, toExample } from "../../../evals/chat/smith";
import type { Asked, ChatQuestion } from "../../../evals/chat/types";

// The LangSmith side of the chat evals: the dataset example and the scores, with no network.

const stored: ChatQuestion = {
  id: "stored-01",
  technology: "nodejs",
  group: "stored",
  question: "How do I install Node.js?",
  expected: ["guide", "stored_docs"],
  mentions: ["make"],
};
const refused: ChatQuestion = {
  id: "nf-01",
  technology: "nodejs",
  group: "not_found",
  question: "What does fs.nope do?",
  expected: ["not_found"],
};
const asked = (change: Partial<Asked> = {}): Asked => ({
  origin: "guide",
  grade: "GOOD",
  reply: "Run make.",
  excerpts: "=== EXCERPT [1] ===\nRun make.",
  cited: ["Install"],
  calls: { context7: 0, search: 0, fetch: 0 },
  firstTokenMs: 1,
  totalMs: 2,
  ...change,
});
const scores = (list: ReturnType<typeof scoreRun>) =>
  Object.fromEntries(list.map((s) => [s.key, s.score]));

describe("the dataset example", () => {
  it("keeps a question through toExample and back", () => {
    for (const q of [stored, refused]) {
      expect(fromExample(toExample(q))).toEqual(q);
    }
  });
});

describe("scoreRun", () => {
  it("passes a stored answer that stayed with the stored text", () => {
    expect(scores(scoreRun(stored, asked()))).toEqual({
      pass: 1,
      origin_ok: 1,
      cited: 1,
      mentions: 1,
      no_invention: null,
      stored_stays_stored: 1,
      no_error: 1,
    });
  });

  it("flags a stored question that went outside, and a missing expected word", () => {
    const s = scores(
      scoreRun(
        stored,
        asked({
          reply: "Something else.",
          calls: { context7: 1, search: 0, fetch: 0 },
        }),
      ),
    );
    expect(s).toMatchObject({ pass: 0, mentions: 0, stored_stays_stored: 0 });
  });

  it("scores answering a question that should be refused as an invention", () => {
    expect(scores(scoreRun(refused, asked({ origin: "guide" })))).toMatchObject(
      {
        pass: 0,
        no_invention: 0,
      },
    );
    expect(
      scores(
        scoreRun(
          refused,
          asked({ origin: "not_found", cited: [], reply: "No." }),
        ),
      ),
    ).toMatchObject({ pass: 1, no_invention: 1 });
  });

  it("counts an error as a failure", () => {
    expect(
      scores(scoreRun(stored, asked({ error: "boom", reply: "", cited: [] }))),
    ).toMatchObject({ pass: 0, no_error: 0 });
  });
});
