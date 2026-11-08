import { describe, expect, it } from "vitest";
import { GenerateError } from "@/lib/agents/generate/errors";
import type {
  GenerateUpdate,
  TechnologyInfo,
} from "@/lib/agents/generate/state";
import { discoverDocs } from "@/lib/agents/generate/nodes/discoverDocs";
import { identify } from "@/lib/agents/generate/nodes/identify";
import {
  docsStartPage,
  findDocsStart,
  findVersion,
  isGrounded,
  resultUrl,
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

describe("resultUrl", () => {
  const hits = [
    { title: "a", url: "https://a.dev/", content: "" },
    {
      title: "b",
      url: "https://docs.oracle.com/en/java/overview.html#Java_1_0_0_1?x=1",
      content: "",
    },
    { title: "c", url: "http://insecure.example", content: "" },
  ];

  it("looks the address up by number, without anchor or query", () => {
    expect(resultUrl(1, hits)).toBe("https://a.dev/");
    expect(resultUrl(2, hits)).toBe(
      "https://docs.oracle.com/en/java/overview.html",
    );
  });

  it("is null for a missing number, a null, or a page that is not https", () => {
    expect(resultUrl(0, hits)).toBeNull();
    expect(resultUrl(9, hits)).toBeNull();
    expect(resultUrl(null, hits)).toBeNull();
    expect(resultUrl(3, hits)).toBeNull();
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
        docsUrl: "https://zod.dev",
        latestVersion: "4.0.0",
      },
    ]);
    expect(update.technology).toEqual({
      id: "tech-1",
      name: "Zod",
      slug: "zod",
      officialUrl: "https://zod.dev/",
      docsUrl: "https://zod.dev",
      version: "4.0.0",
    });
    expect(events).toEqual([
      {
        type: "identified",
        name: "Zod",
        officialUrl: "https://zod.dev/",
        docsUrl: "https://zod.dev",
        version: "4.0.0",
      },
    ]);
    expect(update.budget).toMatchObject({ steps: 1 });
  });

  it("works out the docs start page from the search results, not from the model", async () => {
    const { deps } = fakeDeps({
      hits: [
        { title: "Zod", url: "https://zod.dev/", content: "v4.0.0" },
        {
          title: "Docs",
          url: "https://zod.dev/docs/intro.html#x",
          content: "",
        },
      ],
    });
    const update = await identify(stateWith(), deps);
    expect(technologyOf(update)?.docsUrl).toBe("https://zod.dev/docs");
  });

  it("refuses an official site the model made up, and saves nothing", async () => {
    const { deps, saved } = fakeDeps({
      identify: () => ({
        ...ZOD_ANSWER,
        officialResult: 99, // there is no such search result
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
        officialResult: null,
      }),
    });
    await expect(identify(stateWith({ query: "asdf" }), deps)).rejects.toThrow(
      /Could not find the official documentation for "asdf"/,
    );
  });

  const candidate = (name: string, result: number) => ({
    name,
    description: `${name} thing`,
    result,
  });
  const ambiguous = (candidates: ReturnType<typeof candidate>[]) => ({
    ...ZOD_ANSWER,
    outcome: "ambiguous" as const,
    name: null,
    officialResult: null,
    candidates,
  });

  it("returns 2 to 3 candidates to choose from when the name is ambiguous, saving nothing", async () => {
    const { deps, saved } = fakeDeps({
      identify: () =>
        ambiguous([
          candidate("Zod", 1),
          candidate("Zod API", 2),
          candidate("Third", 1),
          candidate("Fourth", 2),
        ]),
    });
    const update = await identify(stateWith(), deps);
    expect(update.technology).toBeNull();
    expect(update.candidates).toHaveLength(3); // capped at 3
    expect(saved).toEqual([]);
  });

  it("drops candidates whose site is not in the results, and fails if fewer than 2 remain", async () => {
    const { deps } = fakeDeps({
      identify: () => ambiguous([candidate("Real", 1), candidate("Fake", 99)]),
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

  it("tries the official site's own address when the docs start page finds too few pages", async () => {
    const tried: string[] = [];
    const { deps, saved } = fakeDeps();
    const many = Array.from({ length: 8 }, (_, i) => ({
      url: `https://docs.example.com/en/java/p${i}`,
      title: `Page ${i}`,
    }));
    deps.discoverDocs = async (url) => {
      tried.push(url);
      const pages = url.endsWith("/en/java") ? many : [many[0]];
      return {
        source: "crawl",
        pages,
        truncated: false,
        attempts: [{ source: "crawl", pages: pages.length }],
      };
    };
    const update = await discoverDocs(
      stateWith({
        technology: {
          ...technology,
          officialUrl: "https://docs.example.com/en/java",
          docsUrl: "https://docs.example.com",
        },
      }),
      deps,
    );
    expect(tried).toEqual([
      "https://docs.example.com",
      "https://docs.example.com/en/java",
    ]);
    expect(update.discoveredPages).toHaveLength(8);
    expect(technologyOf(update)?.docsUrl).toBe("https://docs.example.com/en/java");
    expect(saved[0]).toMatchObject({
      docsUrl: "https://docs.example.com/en/java",
    });
    expect(update.budget).toMatchObject({ fetches: 2 });
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

describe("docsStartPage", () => {
  it("brings a deep page back to the docs start (the 'hono' search)", () => {
    expect(
      docsStartPage("https://hono.dev/docs/overview.html#hono---web-framework"),
    ).toBe("https://hono.dev/docs");
  });

  it("keeps a docs folder, drops anything else to the site root", () => {
    expect(docsStartPage("https://nextjs.org/docs/app/guides?x=1")).toBe(
      "https://nextjs.org/docs",
    );
    expect(docsStartPage("https://zod.dev/api/strings")).toBe(
      "https://zod.dev",
    );
    expect(docsStartPage("https://zod.dev")).toBe("https://zod.dev");
  });
});

describe("findDocsStart", () => {
  it("uses a docs folder seen on the official site, else the site root", () => {
    const hit = (url: string) => ({ title: "", url, content: "" });
    expect(
      findDocsStart("https://hono.dev", [
        hit("https://other.example/docs"),
        hit("https://hono.dev/docs/overview.html"),
      ]),
    ).toBe("https://hono.dev/docs");
    expect(
      findDocsStart("https://zod.dev/", [hit("https://zod.dev/api")]),
    ).toBe("https://zod.dev");
  });
});
