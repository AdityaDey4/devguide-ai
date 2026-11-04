import { describe, expect, it } from "vitest";
import { GenerateError } from "@/lib/agents/generate/errors";
import type {
  GenerateUpdate,
  TechnologyInfo,
} from "@/lib/agents/generate/state";
import { discoverDocs } from "@/lib/agents/generate/nodes/discoverDocs";
import { identify } from "@/lib/agents/generate/nodes/identify";
import {
  findVersion,
  isGrounded,
} from "@/lib/agents/generate/nodes/identify/grounding";
import { planOutline } from "@/lib/agents/generate/nodes/planOutline";
import { toOutline } from "@/lib/agents/generate/nodes/planOutline/repair";
import { SECTION_KEYS } from "@/lib/agents/generate/sections";
import {
  fakeDeps,
  stateWith,
  ZOD_ANSWER,
  ZOD_HITS,
  ZOD_PAGES,
} from "../../../../helpers/generateFakes";

/** LangGraph types an update field as the value OR an "overwrite" wrapper; nodes return plain values. */
const technologyOf = (update: GenerateUpdate) =>
  update.technology as TechnologyInfo | null | undefined;

describe("isGrounded", () => {
  it("trusts a URL only when its site appears in the search results", () => {
    expect(isGrounded("https://zod.dev/anything", ZOD_HITS)).toBe(true);
    expect(isGrounded("https://zod-docs.io", ZOD_HITS)).toBe(false);
  });

  it("refuses http, junk and empty values", () => {
    expect(isGrounded("http://zod.dev", ZOD_HITS)).toBe(false);
    expect(isGrounded("not a url", ZOD_HITS)).toBe(false);
    expect(isGrounded(null, ZOD_HITS)).toBe(false);
  });
});

describe("findVersion", () => {
  const hit = (content: string, title = "Page") => ({
    title,
    url: "https://x.dev/",
    content,
  });

  it("reads an explicit version from the search results", () => {
    expect(findVersion([hit("Zod 4 is stable. Latest release v4.1.0")])).toBe(
      "4.1.0",
    );
    expect(findVersion([hit("Install version 15.2 today")])).toBe("15.2");
    expect(findVersion([hit("npm i pkg@2.3.4")])).toBe("2.3.4");
    expect(findVersion([hit("nothing here", "Docs v3.5.1")])).toBe("3.5.1");
  });

  it("picks the newest when several are mentioned", () => {
    expect(
      findVersion([
        hit("upgrade from v3.22.4"),
        hit("now at v4.0.1"),
        hit("v4.0.10 is out"),
      ]),
    ).toBe("4.0.10");
  });

  it("returns null when no version is stated, and ignores plain numbers", () => {
    expect(
      findVersion([hit("Built in 2024 with 3.5 million users")]),
    ).toBeNull();
    expect(findVersion([])).toBeNull();
  });
});

describe("identify", () => {
  it("finds one technology, saves it, and tells the UI", async () => {
    const { deps, events, saved, searches, asked } = fakeDeps();
    const update = await identify(stateWith({ query: "zod" }), deps);

    expect(searches).toEqual(["zod official documentation"]);
    expect(asked).toEqual(["small:identify"]);
    expect(saved).toEqual([
      {
        name: "Zod",
        slug: "zod",
        officialUrl: "https://zod.dev/",
        docsUrl: "https://zod.dev/",
        latestVersion: "4.0.0",
      },
    ]);
    expect(update.technology).toEqual({
      id: "tech-1",
      name: "Zod",
      slug: "zod",
      officialUrl: "https://zod.dev/",
      docsUrl: "https://zod.dev/",
      version: "4.0.0",
    });
    expect(events).toEqual([
      {
        type: "identified",
        name: "Zod",
        officialUrl: "https://zod.dev/",
        docsUrl: "https://zod.dev/",
        version: "4.0.0",
      },
    ]);
    expect(update.budget).toMatchObject({ steps: 1 });
  });

  it("falls back to the official site when the docs address was not in the results", async () => {
    const { deps } = fakeDeps({
      identify: () => ({
        ...ZOD_ANSWER,
        docsUrl: "https://invented-docs.example",
      }),
    });
    const update = await identify(stateWith(), deps);
    expect(technologyOf(update)?.docsUrl).toBe("https://zod.dev/");
  });

  it("refuses an official site the model made up, and saves nothing", async () => {
    const { deps, saved } = fakeDeps({
      identify: () => ({
        ...ZOD_ANSWER,
        officialUrl: "https://made-up.example",
      }),
    });
    const error = await identify(stateWith(), deps).catch((e) => e);
    expect(error).toBeInstanceOf(GenerateError);
    expect(error.kind).toBe("technology_not_found");
    expect(saved).toEqual([]);
  });

  it("fails clearly when the results do not describe a technology", async () => {
    const { deps } = fakeDeps({
      identify: () => ({
        ...ZOD_ANSWER,
        outcome: "unknown",
        name: null,
        officialUrl: null,
      }),
    });
    await expect(identify(stateWith({ query: "asdf" }), deps)).rejects.toThrow(
      /Could not find the official documentation for "asdf"/,
    );
  });

  const candidate = (name: string, url: string) => ({
    name,
    description: `${name} thing`,
    url,
  });
  const ambiguous = (candidates: ReturnType<typeof candidate>[]) => ({
    ...ZOD_ANSWER,
    outcome: "ambiguous" as const,
    name: null,
    officialUrl: null,
    docsUrl: null,
    candidates,
  });

  it("returns 2 to 3 candidates to choose from when the name is ambiguous, saving nothing", async () => {
    const { deps, saved } = fakeDeps({
      identify: () =>
        ambiguous([
          candidate("Zod", "https://zod.dev/"),
          candidate("Zod API", "https://zod.dev/api"),
          candidate("Third", "https://zod.dev/x"),
          candidate("Fourth", "https://zod.dev/y"),
        ]),
    });
    const update = await identify(stateWith(), deps);
    expect(update.technology).toBeNull();
    expect(update.candidates).toHaveLength(3); // capped at 3
    expect(saved).toEqual([]);
  });

  it("drops candidates whose site is not in the results, and fails if fewer than 2 remain", async () => {
    const { deps } = fakeDeps({
      identify: () =>
        ambiguous([
          candidate("Real", "https://zod.dev/"),
          candidate("Fake", "https://fake.example"),
        ]),
    });
    await expect(identify(stateWith(), deps)).rejects.toBeInstanceOf(
      GenerateError,
    );
  });

  it("goes ahead with the technology the person chose, instead of asking again", async () => {
    const { deps, asked } = fakeDeps();
    const update = await identify(
      stateWith({ chosenUrl: "https://zod.dev/" }),
      deps,
    );
    expect(technologyOf(update)?.name).toBe("Zod");
    expect(update.chosenUrl).toBeNull(); // used up
    expect(asked).toEqual(["small:identify"]);
  });
});

describe("discoverDocs", () => {
  const technology = {
    id: "tech-1",
    name: "Zod",
    slug: "zod",
    officialUrl: "https://zod.dev/",
    docsUrl: "https://zod.dev/",
    version: null,
  };

  it("keeps the pages found, reports how many, and counts the sources tried as fetches", async () => {
    const { deps, events } = fakeDeps();
    const update = await discoverDocs(stateWith({ technology }), deps);
    expect(update.discoveredPages).toEqual(ZOD_PAGES);
    expect(events).toEqual([{ type: "docs_found", count: 3 }]);
    expect(update.budget).toMatchObject({ steps: 1, fetches: 1 });
  });

  it("fails clearly when the site lists no pages", async () => {
    const { deps } = fakeDeps({ pages: [] });
    const error = await discoverDocs(stateWith({ technology }), deps).catch(
      (e) => e,
    );
    expect(error).toMatchObject({ kind: "no_docs" });
  });
});

describe("planOutline / toOutline", () => {
  const plan = (
    sections: { key: string; pageUrls: string[]; codeHeavy?: boolean }[],
  ) => ({
    sections: sections.map((s) => ({ codeHeavy: false, ...s })),
  });

  it("always returns the 7 standard sections in order, each with 1 to 4 known pages", () => {
    const outline = toOutline(plan([]), ZOD_PAGES); // the model said nothing useful
    expect(outline.map((s) => s.key)).toEqual(SECTION_KEYS);
    expect(outline).toHaveLength(7);
    for (const section of outline) {
      expect(section.pageUrls.length).toBeGreaterThanOrEqual(1);
      expect(section.pageUrls.length).toBeLessThanOrEqual(4);
    }
  });

  it("drops pages that were not discovered, removes repeats and keeps at most 4", () => {
    const outline = toOutline(
      plan([
        {
          key: "core-concepts",
          pageUrls: [
            "https://zod.dev/api",
            "https://zod.dev/api",
            "https://made-up.example/x",
            "https://zod.dev/basics",
            "https://zod.dev/",
          ],
        },
      ]),
      [...ZOD_PAGES, { url: "https://zod.dev/extra", title: "Extra" }],
    );
    const section = outline.find((s) => s.key === "core-concepts")!;
    expect(section.pageUrls).toEqual([
      "https://zod.dev/api",
      "https://zod.dev/basics",
      "https://zod.dev/",
    ]);
  });

  it("gives a section with no usable pages the first discovered page", () => {
    const outline = toOutline(
      plan([{ key: "installation", pageUrls: ["https://made-up.example"] }]),
      ZOD_PAGES,
    );
    expect(outline.find((s) => s.key === "installation")!.pageUrls).toEqual([
      "https://zod.dev/",
    ]);
  });

  it("uses the model's codeHeavy choice, and the default for sections it skipped", () => {
    const outline = toOutline(
      plan([
        { key: "what-it-is", pageUrls: ["https://zod.dev/"], codeHeavy: true },
      ]),
      ZOD_PAGES,
    );
    expect(outline.find((s) => s.key === "what-it-is")!.codeHeavy).toBe(true);
    expect(outline.find((s) => s.key === "installation")!.codeHeavy).toBe(true); // default
  });

  it("tells the UI the section titles and counts the step", async () => {
    const { deps, events, asked } = fakeDeps({
      outline: () =>
        plan([{ key: "what-it-is", pageUrls: ["https://zod.dev/"] }]),
    });
    const update = await planOutline(
      stateWith({
        technology: {
          id: "t",
          name: "Zod",
          slug: "zod",
          officialUrl: "",
          docsUrl: "",
          version: null,
        },
        discoveredPages: ZOD_PAGES,
      }),
      deps,
    );
    expect(update.outline).toHaveLength(7);
    expect(asked).toEqual(["small:outline"]);
    expect(events[0]).toMatchObject({ type: "outline" });
    expect((events[0] as { sections: unknown[] }).sections).toHaveLength(7);
    expect(update.budget).toMatchObject({ steps: 1 });
  });
});
