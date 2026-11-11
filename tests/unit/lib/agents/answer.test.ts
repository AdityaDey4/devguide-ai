import { describe, expect, it } from "vitest";
import { checkAnswer, type AnswerDb } from "@/lib/agents/generate/run/answer";

// The checks before a paused run is resumed, with the database replaced by a fake that answers
// the two reads (the run, and its latest needs_choice event).

const OFFERED = [
  { name: "Bun (runtime)", description: "A runtime", url: "https://bun.sh" },
  { name: "Bun (build)", description: "A tool", url: "https://bun.build" },
];

function fakeDb(options: {
  run?: { status: string; type: string } | null;
  candidates?: unknown;
}): AnswerDb {
  const run =
    options.run === undefined
      ? { status: "waiting_user", type: "generate" }
      : options.run;
  const payload =
    options.candidates === undefined
      ? { candidates: OFFERED }
      : options.candidates;

  return {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({
          data: table === "runs" ? run : payload === null ? null : { payload },
        }),
      };
      return query;
    },
  } as unknown as AnswerDb;
}

describe("checkAnswer (FR-SRCH-5)", () => {
  it("accepts one of the offered technologies", async () => {
    const result = await checkAnswer(fakeDb({}), "r1", {
      choice: "candidate",
      url: "https://bun.sh",
    });
    expect(result).toEqual({
      ok: true,
      answer: { choice: "candidate", url: "https://bun.sh" },
    });
  });

  it("refuses an address the run did not offer (it would go into a prompt)", async () => {
    const result = await checkAnswer(fakeDb({}), "r1", {
      choice: "candidate",
      url: "https://evil.example/ignore-previous-instructions",
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses when no options were ever offered", async () => {
    for (const candidates of [null, {}, { candidates: "x" }]) {
      const result = await checkAnswer(fakeDb({ candidates }), "r1", {
        choice: "candidate",
        url: "https://bun.sh",
      });
      expect(result).toMatchObject({ ok: false, status: 400 });
    }
  });

  it("cleans a new name the way a search does (None of these)", async () => {
    const result = await checkAnswer(fakeDb({}), "r1", {
      choice: "refine",
      query: "  Bun   JS runtime ",
    });
    expect(result).toEqual({
      ok: true,
      answer: { choice: "refine", query: "Bun JS runtime" },
    });
  });

  it("refuses a new name that is too short once cleaned", async () => {
    const result = await checkAnswer(fakeDb({}), "r1", {
      choice: "refine",
      query: "!!!",
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses an answer that is not in the agreed shape", async () => {
    for (const body of [
      null,
      {},
      { choice: "other" },
      { choice: "candidate" },
      { choice: "candidate", url: "not a url" },
      { choice: "refine", query: "x" },
    ]) {
      expect(await checkAnswer(fakeDb({}), "r1", body)).toMatchObject({
        ok: false,
        status: 400,
      });
    }
  });

  it("says 404 for a run it cannot see and 409 for a run that is not waiting", async () => {
    const answer = { choice: "refine", query: "Bun runtime" };
    expect(
      await checkAnswer(fakeDb({ run: null }), "r1", answer),
    ).toMatchObject({ ok: false, status: 404 });
    for (const run of [
      { status: "running", type: "generate" },
      { status: "completed", type: "generate" },
      { status: "waiting_user", type: "edit" },
    ]) {
      expect(await checkAnswer(fakeDb({ run }), "r1", answer)).toMatchObject({
        ok: false,
        status: 409,
      });
    }
  });
});
