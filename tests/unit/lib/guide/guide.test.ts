import { describe, expect, it } from "vitest";
import { linkCitations } from "@/lib/guide/citations";
import { emptyProgress, foldEvents, type EventRow } from "@/lib/guide/progress";

const section = (
  key: string,
  markdown: string,
  citations: { n: number; url: string; title: string }[],
  needs_review = false,
) => ({ key, title: key, markdown, citations, needs_review });

describe("linkCitations (FR-GUIDE-1, FR-GEN-6)", () => {
  it("turns [n] into a link and numbers sources once for the whole guide", () => {
    const result = linkCitations([
      section("a", "Zod parses data [1].", [
        { n: 1, url: "https://zod.dev/api", title: "API" },
      ]),
      section("b", "See also [2][1].", [
        { n: 1, url: "https://zod.dev/basics", title: "Basics" },
        { n: 2, url: "https://zod.dev/api", title: "API" },
      ]),
    ]);

    expect(result.sections[0].markdown).toBe(
      "Zod parses data [1](https://zod.dev/api).",
    );
    // section b's [2] is the api page (global 1), its [1] is basics (global 2)
    expect(result.sections[1].markdown).toBe(
      "See also [1](https://zod.dev/api)[2](https://zod.dev/basics).",
    );
    expect(result.sources).toEqual([
      { n: 1, url: "https://zod.dev/api", title: "API" },
      { n: 2, url: "https://zod.dev/basics", title: "Basics" },
    ]);
  });

  it("leaves markers inside code alone", () => {
    const markdown = "Use `a[1]` here [1].\n\n```ts\nconst x = arr[1];\n```\n";
    const result = linkCitations([
      section("a", markdown, [{ n: 1, url: "https://x.dev/", title: "X" }]),
    ]);
    expect(result.sections[0].markdown).toBe(
      "Use `a[1]` here [1](https://x.dev/).\n\n```ts\nconst x = arr[1];\n```\n",
    );
  });

  it("keeps a marker for a source the section does not have, and skips non-web addresses", () => {
    const result = linkCitations([
      section("a", "One [1], two [2], three [3].", [
        { n: 1, url: "https://x.dev/a", title: "A" },
        { n: 3, url: "javascript:alert(1)", title: "Bad" },
      ]),
    ]);
    expect(result.sections[0].markdown).toBe(
      "One [1](https://x.dev/a), two [2], three [3].",
    );
    expect(result.sources).toHaveLength(1);
  });

  it("makes addresses safe inside a Markdown link", () => {
    const result = linkCitations([
      section("a", "Text [1].", [
        { n: 1, url: "https://x.dev/a_(b) c", title: "A" },
      ]),
    ]);
    expect(result.sections[0].markdown).toBe(
      "Text [1](https://x.dev/a_%28b%29%20c).",
    );
  });

  it("carries the needs-review flag", () => {
    const result = linkCitations([section("a", "x", [], true)]);
    expect(result.sections[0].needsReview).toBe(true);
  });
});

describe("foldEvents (FR-GEN-9, FR-GEN-10)", () => {
  const event = (
    id: number,
    type: string,
    payload: Record<string, unknown> = {},
  ): EventRow => ({ id, type, payload });

  const outline = event(3, "outline", {
    sections: [
      { key: "what", title: "What it is" },
      { key: "why", title: "Why use it" },
    ],
  });

  it("builds the picture from the events, in order", () => {
    const progress = foldEvents(emptyProgress, [
      event(1, "identified", { name: "Hono", version: "4.0" }),
      event(2, "docs_found", { count: 17 }),
      outline,
      event(4, "section_started", { key: "what", title: "What it is" }),
      event(5, "section_delta", { key: "what", text: "Hono is " }),
      event(6, "section_delta", { key: "what", text: "small [1]." }),
      event(7, "section_done", { key: "what", citations: 1 }),
    ]);

    expect(progress).toMatchObject({
      name: "Hono",
      version: "4.0",
      pages: 17,
      lastId: 7,
    });
    expect(progress.sections).toEqual([
      {
        key: "what",
        title: "What it is",
        status: "done",
        text: "Hono is small [1].",
      },
      { key: "why", title: "Why use it", status: "waiting", text: "" },
    ]);
  });

  it("starts a section's text again when it is rewritten", () => {
    const progress = foldEvents(emptyProgress, [
      outline,
      event(4, "section_started", { key: "what" }),
      event(5, "section_delta", { key: "what", text: "first draft" }),
      event(6, "section_done", { key: "what" }),
      event(7, "checking", { keys: ["what"] }),
      event(8, "section_started", { key: "what" }),
      event(9, "section_delta", { key: "what", text: "second draft" }),
    ]);
    expect(progress.sections[0]).toMatchObject({
      status: "writing",
      text: "second draft",
    });
    expect(progress.checking).toBe(true);
  });

  it("gives the same result when replayed in pieces (a reload)", () => {
    const all = [
      event(1, "identified", { name: "Hono" }),
      outline,
      event(4, "section_delta", { key: "why", text: "abc" }),
    ];
    const once = foldEvents(emptyProgress, all);
    const inPieces = foldEvents(
      foldEvents(emptyProgress, all.slice(0, 2)),
      all.slice(2),
    );
    expect(inPieces).toEqual(once);
  });

  it("ignores events it does not know and deltas for unknown sections", () => {
    const progress = foldEvents(emptyProgress, [
      event(1, "completed", { guideId: "g" }),
      event(2, "section_delta", { key: "nope", text: "x" }),
    ]);
    expect(progress.sections).toEqual([]);
    expect(progress.lastId).toBe(2);
  });
});

describe("foldEvents: the choice (FR-SRCH-5)", () => {
  const offer = (id: number, names: string[]): EventRow => ({
    id,
    type: "needs_choice",
    payload: {
      candidates: names.map((name) => ({
        name,
        description: `${name} description`,
        url: `https://${name}.dev`,
      })),
    },
  });

  it("remembers the options and which event offered them", () => {
    const progress = foldEvents(emptyProgress, [offer(4, ["bun", "bunjs"])]);
    expect(progress.candidates).toEqual([
      { name: "bun", description: "bun description", url: "https://bun.dev" },
      {
        name: "bunjs",
        description: "bunjs description",
        url: "https://bunjs.dev",
      },
    ]);
    expect(progress.choiceId).toBe(4);
  });

  it("treats a second offer (after None of these) as a new question", () => {
    const progress = foldEvents(emptyProgress, [
      offer(4, ["bun", "bunjs"]),
      offer(9, ["bun runtime", "bun build"]),
    ]);
    expect(progress.choiceId).toBe(9);
    expect(progress.candidates?.map((c) => c.name)).toEqual([
      "bun runtime",
      "bun build",
    ]);
  });

  it("forgets the options once a technology is identified", () => {
    const progress = foldEvents(emptyProgress, [
      offer(4, ["bun"]),
      { id: 5, type: "identified", payload: { name: "Bun" } },
    ]);
    expect(progress.candidates).toBeNull();
  });
});
