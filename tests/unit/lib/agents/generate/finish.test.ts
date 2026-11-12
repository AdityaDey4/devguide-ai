import { MemorySaver } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";
import { MAX_REWRITES } from "@/lib/agents/generate/config";
import { buildGenerateGraph } from "@/lib/agents/generate/graph";
import { assembleGuide } from "@/lib/agents/generate/nodes/assembleGuide";
import { rewriteSection } from "@/lib/agents/generate/nodes/rewriteSection";
import { buildRewriteMessages } from "@/lib/agents/generate/nodes/rewriteSection/prompt";
import type { OutlineSection, SectionDraft } from "@/lib/agents/generate/state";
import { SECTIONS } from "@/lib/agents/generate/sections";
import { newBudget } from "@/lib/agents/shared/budget";
import { fakeDeps, stateWith } from "../../../../helpers/generateFakes";

const technology = {
  id: "tech-1",
  name: "Zod",
  slug: "zod",
  officialUrl: "https://zod.dev/",
  docsUrl: "https://zod.dev/",
  version: "4.0.0",
};
const section: OutlineSection = {
  key: "installation",
  title: "Installation and setup",
  goal: "Show how to install it.",
  pageUrls: ["https://zod.dev/basics"],
  codeHeavy: true,
};
const failing: SectionDraft = {
  title: "Installation and setup",
  markdown:
    "Install it somehow, there is no citation in this explanatory paragraph.",
  citations: [],
  sources: [
    {
      n: 1,
      url: "https://zod.dev/basics",
      title: "Basic usage",
      markdown: "Install with npm install zod.",
    },
  ],
  status: "draft",
  issues: [
    "The section cites no source.",
    '1 explanatory paragraph has no citation, e.g. "Install it..."',
  ],
};

describe("buildRewriteMessages", () => {
  const [system, user] = buildRewriteMessages(technology, section, failing) as {
    content: string;
  }[];

  it("gives the same rules as the first draft", () => {
    expect(system.content).toMatch(/ONLY the reference material/);
  });

  it("lists every problem, the old draft and the same numbered sources", () => {
    expect(user.content).toContain("- The section cites no source.");
    expect(user.content).toContain("- 1 explanatory paragraph has no citation");
    expect(user.content).toContain("Previous draft:\nInstall it somehow");
    expect(user.content).toContain(
      "=== SOURCE [1]: Basic usage (https://zod.dev/basics) ===",
    );
  });
});

describe("rewriteSection", () => {
  const input = (attempts = 0) => ({
    runId: "run-1",
    technology,
    section,
    draft: failing,
    attempts,
    budget: newBudget(),
  });
  const fixed =
    "Install it with `npm install zod` [1]. That is the only step needed.";

  it("writes the section again from the same sources, as a new draft to be checked", async () => {
    const { deps, fetched } = fakeDeps({ text: () => fixed });
    const update = await rewriteSection(input(), deps);
    const draft = (update.sections as Record<string, SectionDraft>)
      .installation;

    expect(draft.markdown).toBe(fixed);
    expect(draft.status).toBe("draft"); // not trusted until checked again
    expect(draft.issues).toBeUndefined();
    expect(draft.sources).toEqual(failing.sources);
    expect(draft.citations.map((c) => c.n)).toEqual([1]);
    expect(fetched).toEqual([]); // nothing downloaded again
  });

  it("counts the attempt and one step", async () => {
    const { deps } = fakeDeps({ text: () => fixed });
    const update = await rewriteSection(input(1), deps);
    expect(update.checkAttempts).toEqual({ installation: 2 });
    expect(update.budget).toMatchObject({ steps: 1 });
  });

  it("streams to the UI between a start and a done event", async () => {
    const { deps, events } = fakeDeps({ text: () => fixed });
    await rewriteSection(input(), deps);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("section_started");
    expect(types.at(-1)).toBe("section_done");
    expect(types).toContain("section_delta");
  });
});

describe("assembleGuide", () => {
  const stateFor = (
    statuses: Record<string, SectionDraft["status"]>,
    citations = true,
  ) => {
    const outline = SECTIONS.map((s) => ({
      ...s,
      pageUrls: ["https://zod.dev/"],
    }));
    const sections: Record<string, SectionDraft> = {};
    for (const def of outline) {
      sections[def.key] = {
        title: def.title,
        markdown: `Text of ${def.key} that is long enough to be a real paragraph of the guide [1].`,
        citations: citations
          ? [{ n: 1, url: "https://zod.dev/", title: "Zod" }]
          : [],
        sources: [],
        status: statuses[def.key] ?? "ok",
      };
    }
    return stateWith({ technology, outline, sections });
  };

  it("saves the sections in outline order, ready when every one cites a source", async () => {
    const { deps, guides } = fakeDeps();
    await assembleGuide(stateFor({}), deps);

    expect(guides).toHaveLength(1);
    expect(guides[0]).toMatchObject({
      technologyId: "tech-1",
      status: "ready",
    });
    expect(guides[0].sections.map((s) => s.key)).toEqual(
      SECTIONS.map((s) => s.key),
    );
    expect(guides[0].sections[0]).toEqual({
      key: "what-it-is",
      title: "What it is",
      markdown: expect.stringContaining("Text of what-it-is"),
      citations: [{ n: 1, url: "https://zod.dev/", title: "Zod" }],
      needs_review: false,
    });
  });

  it("flags the sections that still need review, but keeps them", async () => {
    const { deps, guides } = fakeDeps();
    await assembleGuide(stateFor({ gotchas: "needs_review" }), deps);
    const flags = guides[0].sections.map((s) => [s.key, s.needs_review]);
    expect(flags.filter(([, flag]) => flag)).toEqual([["gotchas", true]]);
    expect(guides[0].sections).toHaveLength(7);
  });

  it("is only 'partial' when a section cites nothing", async () => {
    const { deps, guides } = fakeDeps();
    await assembleGuide(stateFor({}, false), deps);
    expect(guides[0].status).toBe("partial");
  });

  it("hands the saved guide to the indexer: its id, the technology and every section", async () => {
    const { deps, indexed } = fakeDeps();
    await assembleGuide(stateFor({}), deps);

    expect(indexed).toHaveLength(1);
    expect(indexed[0]).toMatchObject({
      guideId: "guide-1",
      technology: { id: "tech-1", slug: "zod", version: "4.0.0" },
    });
    expect(indexed[0].sections.map((s) => s.title)).toEqual(
      SECTIONS.map((s) => s.title),
    );
  });

  it("tells the UI the guide and version, and returns them", async () => {
    const { deps, events } = fakeDeps();
    const update = await assembleGuide(stateFor({}), deps);
    expect(events).toEqual([
      { type: "completed", guideId: "guide-1", versionId: "version-1" },
    ]);
    expect(update).toMatchObject({
      guideId: "guide-1",
      versionId: "version-1",
    });
    expect(update.budget).toMatchObject({ steps: 1 });
  });

  it("fails clearly if a section was never written", async () => {
    const { deps } = fakeDeps();
    const state = stateFor({});
    delete state.sections["gotchas"];
    await expect(assembleGuide(state, deps)).rejects.toThrow(
      /section "gotchas" was never written/,
    );
  });
});

describe("the whole graph, with checking and rewriting", () => {
  const config = { configurable: { thread_id: "run-1" } };
  const start = { runId: "run-1", query: "zod" };
  const UNCITED =
    "This paragraph explains things at length but it names no source whatsoever.";
  const CITED =
    "This paragraph explains things at length and names its source [1].";

  it("rewrites a section that fails its check, then accepts it", async () => {
    const { deps, written, guides } = fakeDeps({
      text: (_n, rewrite) => (rewrite ? CITED : UNCITED),
    });
    const graph = buildGenerateGraph(new MemorySaver(), deps);
    const final = await graph.invoke(start, config);

    expect(written).toHaveLength(14); // 7 first drafts + 7 rewrites
    expect(Object.values(final.sections).every((s) => s.status === "ok")).toBe(
      true,
    );
    expect(Object.values(final.checkAttempts)).toEqual(Array(7).fill(1));
    expect(guides[0].status).toBe("ready");
    expect(guides[0].sections.every((s) => !s.needs_review)).toBe(true);
  });

  it("gives up after two rewrites and keeps the section flagged for review", async () => {
    const { deps, written, guides, events } = fakeDeps({ text: () => UNCITED });
    const graph = buildGenerateGraph(new MemorySaver(), deps);
    const final = await graph.invoke(start, config);

    expect(written).toHaveLength(7 * (1 + MAX_REWRITES)); // 21: never an endless loop
    expect(
      Object.values(final.sections).every((s) => s.status === "needs_review"),
    ).toBe(true);
    expect(final.guideId).toBe("guide-1"); // the run still finishes and saves the guide
    expect(guides[0].sections.every((s) => s.needs_review)).toBe(true);
    expect(events.filter((e) => e.type === "checking")).toHaveLength(3); // after write and each rewrite
    expect(events.at(-1)).toMatchObject({ type: "completed" });
  });

  it("rewrites only the sections that failed", async () => {
    let drafts = 0;
    const { deps, written } = fakeDeps({
      // the first section written is bad on its first draft only; all others are fine
      text: (_n, rewrite) => (!rewrite && ++drafts === 1 ? UNCITED : CITED),
    });
    const graph = buildGenerateGraph(new MemorySaver(), deps);
    const final = await graph.invoke(start, config);

    expect(written).toHaveLength(8); // 7 drafts + 1 rewrite
    expect(Object.values(final.checkAttempts)).toEqual([1]);
  });

  it("stays well inside the run's step budget in the worst case", async () => {
    const { deps } = fakeDeps({ text: () => UNCITED });
    const graph = buildGenerateGraph(new MemorySaver(), deps);
    const final = await graph.invoke(start, config);
    // 3 + 7 writes + 3 checks + 14 rewrites + 1 assemble = 28 of the 60 allowed
    expect(final.budget.steps).toBe(28);
  });
});
