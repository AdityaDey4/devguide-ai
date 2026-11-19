import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Asked } from "../../../evals/chat/types";

// The LLM judge's wrapper, with the model replaced: what it is asked, and how its claims and
// quotes are checked by code. Whether the real model matches claims well is checked by hand
// (see the 2026-11 notes in docs/05): it caught 3 of 4 invented insertions and raised no false
// alarm on 13 real answers.

const ask = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agents/shared/llm", () => ({ askStructured: ask }));

import {
  evidenceIsReal,
  GROUNDEDNESS_RULES,
  judgeGroundedness,
  missingSpecifics,
} from "../../../evals/chat/groundedness";

const EXCERPTS =
  "=== EXCERPT [1] ===\nRun `make test-only` to check the build. Node.js 26 needs Visual Studio.\n=== END EXCERPT [1] ===";

const asked = (change: Partial<Asked> = {}): Asked => ({
  origin: "guide",
  grade: "GOOD",
  reply: "Run `make test-only` [1].",
  excerpts: EXCERPTS,
  cited: ["Install"],
  calls: { context7: 0, search: 0, fetch: 0 },
  firstTokenMs: 1,
  totalMs: 2,
  ...change,
});

const claim = (text: string, evidence: string | null, specific = true) => ({
  claim: text,
  specific,
  evidence,
});

beforeEach(() => ask.mockReset());

describe("judgeGroundedness", () => {
  it("gives the model the question, the excerpts and the answer, with the rules", async () => {
    ask.mockResolvedValue({ claims: [] });
    await judgeGroundedness("How do I install?", asked());
    const [size, , messages] = ask.mock.calls[0];
    expect(size).toBe("large");
    expect(messages[0]).toEqual({
      role: "system",
      content: GROUNDEDNESS_RULES,
    });
    expect(messages[1].content).toContain("How do I install?");
    expect(messages[1].content).toContain("make test-only");
    expect(messages[1].content).toContain("Answer:\nRun `make test-only` [1].");
  });

  it("is grounded when each specific claim has evidence that is in the excerpts", async () => {
    ask.mockResolvedValue({
      claims: [
        claim(
          "Run `make test-only`",
          "Run `make test-only` to check the build.",
        ),
        claim("General explanation", null, false),
      ],
    });
    expect(await judgeGroundedness("q", asked())).toEqual({
      grounded: true,
      unsupported: [],
      fakeEvidence: [],
      checked: 1,
    });
  });

  it("is not grounded when a specific claim has no evidence", async () => {
    ask.mockResolvedValue({ claims: [claim("It needs Java 8", null)] });
    expect(await judgeGroundedness("q", asked())).toMatchObject({
      grounded: false,
      unsupported: ["It needs Java 8"],
    });
  });

  it("is not grounded when the quoted evidence is not in the excerpts", async () => {
    ask.mockResolvedValue({
      claims: [claim("Pass --turbo", "You must pass the --turbo flag now")],
    });
    expect(await judgeGroundedness("q", asked())).toMatchObject({
      grounded: false,
      fakeEvidence: ["Pass --turbo"],
    });
  });

  it("is not grounded when the claim names a code name or number the excerpts lack", async () => {
    ask.mockResolvedValue({
      claims: [
        claim(
          "`make test-only` needs Node.js 99",
          "Run `make test-only` to check the build.",
        ),
      ],
    });
    expect(await judgeGroundedness("q", asked())).toMatchObject({
      grounded: false,
    });
  });

  it("does not call the model for a refusal, a direct reply, an error or an empty answer", async () => {
    for (const change of [
      { origin: "not_found" as const },
      { origin: "none" as const },
      { error: "boom" },
      { reply: "" },
      { excerpts: "" },
    ]) {
      expect(await judgeGroundedness("q", asked(change))).toBeNull();
    }
    expect(ask).not.toHaveBeenCalled();
  });
});

describe("evidenceIsReal", () => {
  it("accepts an exact passage, ignoring case, spacing and markdown marks", () => {
    expect(evidenceIsReal("RUN make test-only  to check", EXCERPTS)).toBe(true);
  });
  it("accepts a slightly reworded quote and rejects one with words the excerpts lack", () => {
    expect(
      evidenceIsReal("check the build, run make test-only", EXCERPTS),
    ).toBe(true);
    expect(
      evidenceIsReal("retries three times with mode 0o777", EXCERPTS),
    ).toBe(false);
  });
  it("rejects an empty quote", () => {
    expect(evidenceIsReal("  ", EXCERPTS)).toBe(false);
  });
});

describe("missingSpecifics", () => {
  it("does not count the full stop after a number as part of it", () => {
    expect(missingSpecifics("It needs Node.js 26.", EXCERPTS)).toEqual([]);
  });
  it("compares a called name without its brackets, since the excerpt shows the arguments", () => {
    expect(missingSpecifics("Use `make test-only()` here", EXCERPTS)).toEqual(
      [],
    );
  });

  it("lists code names and numbers that the excerpts do not contain", () => {
    expect(
      missingSpecifics(
        "Use `make test-only` and `megaSort` on Node.js 26 or 99",
        EXCERPTS,
      ),
    ).toEqual(["megaSort", "99"]);
  });
});
