import { describe, expect, it } from "vitest";
import { grade } from "@/lib/agents/chat/nodes/grade";
import { GRADE_RULES } from "@/lib/agents/chat/nodes/grade/prompt";
import {
  chatStateWith,
  fakeChatDeps,
  ranked,
} from "../../../helpers/chatFakes";

// The grader (SRS FR-CHAT-5): are the retrieved chunks enough to answer? With a fake small model:
// what it is shown, and how its verdict is passed on.

const text = (messages: unknown[]) =>
  messages.map((m) => (m as { content: string }).content).join("\n");

describe("grade", () => {
  it("shows the model the question and the numbered excerpts, and asks for a judgement only", async () => {
    const { deps, asked } = fakeChatDeps();
    await grade(
      chatStateWith({
        chunks: [
          ranked({ content: "FIRST TEXT" }),
          ranked({ content: "SECOND TEXT", sourceUrl: null }),
        ],
      }),
      deps,
    );

    const sent = text(asked[0]);
    expect(sent).toContain("Question: How do I validate a URL with Zod?");
    expect(sent).toContain("EXCERPT [1]");
    expect(sent).toContain("EXCERPT [2]");
    expect(sent).toContain("FIRST TEXT");
    expect(sent).toContain("this guide");
    expect(GRADE_RULES).toContain("You do not answer the question");
  });

  it("passes on GOOD with nothing missing", async () => {
    const { deps } = fakeChatDeps({
      grade: { verdict: "GOOD", missing: "" },
    });
    expect(await grade(chatStateWith({ chunks: [ranked()] }), deps)).toEqual({
      grade: { verdict: "GOOD", missing: "" },
    });
  });

  it("passes on PARTIAL and BAD with what is missing", async () => {
    for (const verdict of ["PARTIAL", "BAD"] as const) {
      const { deps } = fakeChatDeps({
        grade: { verdict, missing: "  z.url options  " },
      });
      expect(await grade(chatStateWith({ chunks: [ranked()] }), deps)).toEqual({
        grade: { verdict, missing: "z.url options" },
      });
    }
  });

  it("drops a `missing` the model wrote next to GOOD", async () => {
    const { deps } = fakeChatDeps({
      grade: { verdict: "GOOD", missing: "maybe more detail" },
    });
    const update = await grade(chatStateWith({ chunks: [ranked()] }), deps);
    expect(update.grade).toEqual({ verdict: "GOOD", missing: "" });
  });

  it("searches for the whole question when the model says PARTIAL but not what is missing", async () => {
    const { deps } = fakeChatDeps({
      grade: { verdict: "PARTIAL", missing: "   " },
    });
    const update = await grade(chatStateWith({ chunks: [ranked()] }), deps);
    expect(update.grade).toEqual({
      verdict: "PARTIAL",
      missing: "How do I validate a URL with Zod?",
    });
  });

  it("with no chunks it is BAD, the whole question is missing, and the model is not asked", async () => {
    const { deps, asked } = fakeChatDeps();
    const update = await grade(chatStateWith({ chunks: [] }), deps);
    expect(asked).toEqual([]);
    expect(update.grade).toEqual({
      verdict: "BAD",
      missing: "How do I validate a URL with Zod?",
    });
  });
});
