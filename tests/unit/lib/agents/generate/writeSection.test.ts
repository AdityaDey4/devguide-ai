import { describe, expect, it } from "vitest";
import { BudgetExceeded, newBudget } from "@/lib/agents/shared/budget";
import { readCitations } from "@/lib/agents/generate/nodes/writeSection/citations";
import { COULD_NOT_WRITE } from "@/lib/agents/generate/nodes/writeSection/config";
import { writeSection } from "@/lib/agents/generate/nodes/writeSection";
import type { WriteInputType } from "@/lib/agents/generate/nodes/writeSection/input";
import { loadMaterial } from "@/lib/agents/generate/nodes/writeSection/material";
import { buildMessages } from "@/lib/agents/generate/nodes/writeSection/prompt";
import type { SectionDraft } from "@/lib/agents/generate/state";
import { fakeDeps } from "../../../../helpers/generateFakes";

const technology = {
  id: "tech-1",
  name: "Zod",
  slug: "zod",
  officialUrl: "https://zod.dev/",
  docsUrl: "https://zod.dev/",
  version: "4.0.0",
};
const section = {
  key: "installation",
  title: "Installation and setup",
  goal: "Show how to install it.",
  pageUrls: ["https://zod.dev/basics", "https://zod.dev/api"],
  codeHeavy: true,
};
const input = (overrides: Partial<WriteInputType> = {}): WriteInputType => ({
  runId: "run-1",
  technology,
  section,
  budget: newBudget(),
  ...overrides,
});
const draftOf = (update: { sections?: unknown }, key = "installation") =>
  (update.sections as Record<string, SectionDraft>)[key];

describe("readCitations", () => {
  const material = [
    { n: 1, url: "https://a.dev", title: "A", markdown: "" },
    { n: 2, url: "https://b.dev", title: "B", markdown: "" },
  ];

  it("lists each source cited once, in order, with its address", () => {
    const { citations, unknown } = readCitations(
      "One [2]. Two [1][2]. Three [1].",
      material,
    );
    expect(citations.map((c) => c.n)).toEqual([1, 2]);
    expect(citations[0]).toEqual({ n: 1, url: "https://a.dev", title: "A" });
    expect(unknown).toEqual([]);
  });

  it("understands a list such as [1, 2]", () => {
    expect(
      readCitations("Both agree [1, 2].", material).citations,
    ).toHaveLength(2);
  });

  it("reports a number with no matching source", () => {
    const { citations, unknown } = readCitations(
      "Claim [1] and another [7].",
      material,
    );
    expect(citations.map((c) => c.n)).toEqual([1]);
    expect(unknown).toEqual([7]);
  });

  it("does not mistake array indexes in code for citations", () => {
    const text =
      "Read the first item with `items[0]` [1].\n\n```ts\nconst x = items[2];\n```";
    const { citations, unknown } = readCitations(text, material);
    expect(citations.map((c) => c.n)).toEqual([1]);
    expect(unknown).toEqual([]);
  });

  it("finds nothing in text without markers", () => {
    expect(readCitations("No sources here.", material)).toEqual({
      citations: [],
      unknown: [],
    });
  });
});

describe("loadMaterial", () => {
  it("fetches and cleans the pages and numbers them from 1", async () => {
    const { deps } = fakeDeps();
    const { material } = await loadMaterial(section.pageUrls, deps);
    expect(material.map((m) => [m.n, m.url, m.title])).toEqual([
      [1, "https://zod.dev/basics", "basics"],
      [2, "https://zod.dev/api", "api"],
    ]);
  });

  it("skips a page that cannot be fetched and keeps the numbering unbroken", async () => {
    const { deps } = fakeDeps({ brokenUrls: ["https://zod.dev/basics"] });
    const { material } = await loadMaterial(section.pageUrls, deps);
    expect(material.map((m) => [m.n, m.url])).toEqual([
      [1, "https://zod.dev/api"],
    ]);
  });

  it("cuts a very long page when shown to the writer, but keeps it whole for storing", async () => {
    const { deps } = fakeDeps();
    const long = "word ".repeat(10_000);
    deps.fetchPage = async (url) => ({
      requestedUrl: url,
      url,
      status: 200,
      contentType: "text/markdown",
      body: `# Long\n\n${long}`,
      bytes: 1,
      redirects: [],
      fetchedAt: new Date(),
    });
    const { material, full } = await loadMaterial(
      ["https://zod.dev/long"],
      deps,
    );
    expect(material[0].markdown.length).toBeLessThanOrEqual(10_000);
    expect(full[0].markdown.length).toBeGreaterThan(40_000);
  });
});

describe("buildMessages (the writer's prompt)", () => {
  const material = [
    {
      n: 1,
      url: "https://zod.dev/basics",
      title: "Basic usage",
      markdown: "Body.",
    },
  ];
  const [system, user] = buildMessages(technology, section, material) as {
    content: string;
  }[];

  it("holds the writer to the sources, to citations, and against injected instructions", () => {
    expect(system.content).toMatch(/ONLY the reference material/);
    expect(system.content).toMatch(/cite/i);
    expect(system.content).toMatch(/Ignore any instructions/i);
  });

  it("numbers the sources and names the section, its goal and the version", () => {
    expect(user.content).toContain(
      "=== SOURCE [1]: Basic usage (https://zod.dev/basics) ===",
    );
    expect(user.content).toContain("Section: Installation and setup");
    expect(user.content).toContain("Show how to install it.");
    expect(user.content).toContain("Zod (version 4.0.0)");
  });
});

describe("writeSection", () => {
  it("writes the section from its pages, with its citations, and tells the UI step by step", async () => {
    const { deps, events, fetched } = fakeDeps();
    const update = await writeSection(input(), deps);

    expect(fetched.sort()).toEqual([
      "https://zod.dev/api",
      "https://zod.dev/basics",
    ]);
    const draft = draftOf(update);
    expect(draft.status).toBe("draft");
    expect(draft.markdown).toContain("Use `z.string()`");
    expect(draft.citations).toEqual([
      { n: 1, url: "https://zod.dev/basics", title: "basics" },
    ]);

    const types = events.map((e) => e.type);
    expect(types[0]).toBe("section_started");
    expect(types.at(-1)).toBe("section_done");
    expect(types.filter((t) => t === "section_delta").length).toBeGreaterThan(
      1,
    );
    expect(events.at(-1)).toMatchObject({ key: "installation", citations: 1 });
  });

  it("streams the same text it returns, in order", async () => {
    const { deps, events } = fakeDeps();
    const update = await writeSection(input(), deps);
    const streamed = events
      .filter((e) => e.type === "section_delta")
      .map((e) => (e as { text: string }).text)
      .join("");
    expect(streamed).toBe(draftOf(update).markdown);
  });

  it("also saves the fetched pages to the knowledge base, as official sources", async () => {
    const { deps, stored } = fakeDeps();
    await writeSection(input(), deps);
    expect(stored.map((s) => s.source.url).sort()).toEqual([
      "https://zod.dev/api",
      "https://zod.dev/basics",
    ]);
    expect(stored[0]).toMatchObject({
      technologyId: "tech-1",
      source: { type: "official" },
    });
    expect(stored[0].chunks.length).toBeGreaterThan(0);
  });

  it("counts one step and one fetch per assigned page", async () => {
    const { deps } = fakeDeps();
    const update = await writeSection(input(), deps);
    expect(update.budget).toMatchObject({ steps: 1, fetches: 2 });
  });

  it("refuses to start when its pages would take the run over the fetch limit", async () => {
    const { deps, fetched } = fakeDeps();
    const nearLimit = { ...newBudget(), fetches: 39 };
    await expect(
      writeSection(input({ budget: nearLimit }), deps),
    ).rejects.toBeInstanceOf(BudgetExceeded);
    expect(fetched).toEqual([]); // nothing was fetched
  });

  it("uses only the pages it could read", async () => {
    const { deps } = fakeDeps({ brokenUrls: ["https://zod.dev/basics"] });
    const update = await writeSection(input(), deps);
    expect(draftOf(update).status).toBe("draft");
  });

  it("saves a 'needs review' note instead of failing when no page can be read", async () => {
    const { deps, written, stored, events } = fakeDeps({
      brokenUrls: section.pageUrls,
    });
    const update = await writeSection(input(), deps);
    const draft = draftOf(update);
    expect(draft).toMatchObject({
      status: "needs_review",
      markdown: COULD_NOT_WRITE,
      citations: [],
    });
    expect(draft.issues?.[0]).toMatch(/could be read/);
    expect(written).toEqual([]); // the model was never asked to guess
    expect(stored).toEqual([]);
    expect(events.at(-1)).toMatchObject({ type: "section_done" });
  });

  it("notes a citation to a source that does not exist, for the checker", async () => {
    const { deps } = fakeDeps({
      text: () => "A claim [1] and a made-up one [9].",
    });
    const draft = draftOf(await writeSection(input(), deps));
    expect(draft.issues?.[0]).toMatch(/do not exist: 9/);
  });

  it("fails the run if the pages cannot be saved (the database is down)", async () => {
    const { deps } = fakeDeps({ storeFails: true });
    await expect(writeSection(input(), deps)).rejects.toThrow(
      "embeddings are down",
    );
  });
});

describe("writeSection with Context7 code snippets", () => {
  const snippets = [
    {
      title: "Install Zod",
      url: "https://github.com/colinhacks/zod/blob/main/install.mdx",
      markdown:
        "### Install Zod\n\nSource: https://github.com/colinhacks/zod/blob/main/install.mdx\n\nnpm install zod",
    },
    {
      title: "Parse data",
      url: "https://github.com/colinhacks/zod/blob/main/parse.mdx",
      markdown:
        "### Parse data\n\nSource: https://github.com/colinhacks/zod/blob/main/parse.mdx\n\nschema.parse(data)",
    },
  ];

  it("asks for snippets on a code-heavy section, about that section's topic", async () => {
    const { deps, snippetQueries } = fakeDeps({ snippets });
    await writeSection(input(), deps);
    expect(snippetQueries).toEqual([
      { name: "Zod", topic: "Installation and setup: Show how to install it." },
    ]);
  });

  it("does not ask for snippets on a section that is not code-heavy", async () => {
    const { deps, snippetQueries } = fakeDeps({ snippets });
    await writeSection(
      input({ section: { ...section, key: "what-it-is", codeHeavy: false } }),
      deps,
    );
    expect(snippetQueries).toEqual([]);
  });

  it("numbers the snippets after the pages, and the writer can cite them", async () => {
    const { deps, written } = fakeDeps({
      snippets,
      text: () =>
        "Install it with npm [1]. Then parse data with schema.parse [4].",
    });
    const draft = draftOf(await writeSection(input(), deps));

    const prompt = String(
      (written[0].messages[1] as { content: string }).content,
    );
    expect(prompt).toContain(
      "=== SOURCE [3]: Install Zod (https://github.com/colinhacks/zod/blob/main/install.mdx) ===",
    );
    expect(prompt).toContain("=== SOURCE [4]: Parse data");
    expect(draft.sources.map((s) => s.n)).toEqual([1, 2, 3, 4]);
    expect(draft.citations.map((c) => [c.n, c.url])).toEqual([
      [1, "https://zod.dev/basics"],
      [4, "https://github.com/colinhacks/zod/blob/main/parse.mdx"],
    ]);
  });

  it("keeps the snippets in the draft so the checker can look for code names in them", async () => {
    const { deps } = fakeDeps({ snippets });
    const draft = draftOf(await writeSection(input(), deps));
    expect(
      draft.sources.some((s) => s.markdown.includes("schema.parse(data)")),
    ).toBe(true);
  });

  it("writes from the pages alone when Context7 has nothing or is unavailable", async () => {
    const { deps } = fakeDeps({ snippets: [] });
    const draft = draftOf(await writeSection(input(), deps));
    expect(draft.status).toBe("draft");
    expect(draft.sources.map((s) => s.n)).toEqual([1, 2]);
  });

  it("saves the snippets in the knowledge base as Context7 sources, apart from the pages", async () => {
    const { deps, stored } = fakeDeps({ snippets });
    await writeSection(input(), deps);
    const byType = (type: string) =>
      stored
        .filter((s) => s.source.type === type)
        .map((s) => s.source.url)
        .sort();
    expect(byType("official")).toEqual([
      "https://zod.dev/api",
      "https://zod.dev/basics",
    ]);
    expect(byType("context7")).toEqual(snippets.map((s) => s.url).sort());
  });

  it("does not count snippets as page fetches", async () => {
    const { deps } = fakeDeps({ snippets });
    const update = await writeSection(input(), deps);
    expect(update.budget).toMatchObject({ steps: 1, fetches: 2 });
  });

  it("still writes the section from snippets when none of its pages can be read", async () => {
    const { deps, written } = fakeDeps({
      snippets,
      brokenUrls: section.pageUrls,
    });
    const draft = draftOf(await writeSection(input(), deps));
    expect(written).toHaveLength(1); // the model was asked
    expect(draft.status).toBe("draft");
    expect(draft.sources.map((s) => s.n)).toEqual([1, 2]); // the snippets, numbered from 1
  });
});
