import { describe, expect, it } from "vitest";
import { MAX_REWRITES } from "@/lib/agents/generate/config";
import { checkSections } from "@/lib/agents/generate/nodes/checkSections";
import { checkDraft } from "@/lib/agents/generate/nodes/checkSections/check";
import {
  codeBlocks,
  missingNames,
} from "@/lib/agents/generate/nodes/checkSections/codeNames";
import { findUncited } from "@/lib/agents/generate/nodes/checkSections/paragraphs";
import type { SectionDraft } from "@/lib/agents/generate/state";
import { fakeDeps, stateWith } from "../../../../helpers/generateFakes";

const SOURCE =
  "Zod schemas: z.object, z.string, parse and safeParse. Install with npm install zod. import { z } from 'zod'.";
const sources = [
  {
    n: 1,
    url: "https://zod.dev/basics",
    title: "Basic usage",
    markdown: SOURCE,
  },
];

const draft = (
  markdown: string,
  overrides: Partial<SectionDraft> = {},
): SectionDraft => ({
  title: "Core concepts",
  markdown,
  citations: [{ n: 1, url: "https://zod.dev/basics", title: "Basic usage" }],
  sources,
  status: "draft",
  ...overrides,
});

describe("findUncited (paragraphs without a citation)", () => {
  const valid = new Set([1, 2]);

  it("returns the explanatory paragraphs that cite nothing", () => {
    const text =
      "Zod validates data at runtime and infers types from it [1].\n\nIt is also small, fast and has no dependencies at all, which many teams value.";
    const uncited = findUncited(text, valid);
    expect(uncited).toHaveLength(1);
    expect(uncited[0]).toMatch(
      /^It is also small, fast and has no dependencies/,
    );
  });

  it("accepts a citation anywhere inside the paragraph", () => {
    expect(
      findUncited(
        "[1] Zod validates data at runtime and infers types from the schema.",
        valid,
      ),
    ).toEqual([]);
  });

  it("does not count a citation to a source that does not exist", () => {
    expect(
      findUncited(
        "Zod validates data at runtime and infers types from the schema [9].",
        valid,
      ),
    ).toHaveLength(1);
  });

  it("ignores code blocks, headings and short lead-in lines", () => {
    const text =
      "### Install\n\nInstall it with:\n\n```bash\nnpm install zod\n```\n\nZod validates data [1] and that is all.";
    expect(findUncited(text, valid)).toEqual([]);
  });

  it("does not take an array index in code for a citation", () => {
    expect(
      findUncited(
        "Read the first item with `items[1]` and then loop over the rest of the list.",
        valid,
      ),
    ).toHaveLength(1);
  });

  it("shortens a long paragraph in the report", () => {
    const [snippet] = findUncited("word ".repeat(60), valid);
    expect(snippet.length).toBeLessThanOrEqual(70);
    expect(snippet.endsWith("…")).toBe(true);
  });
});

describe("missingNames (code names not in the sources)", () => {
  const code = (body: string) => `Text.\n\n\`\`\`ts\n${body}\n\`\`\``;

  it("finds the code blocks of a markdown text", () => {
    expect(codeBlocks(code("a()"))).toEqual(["a()\n"]);
    expect(codeBlocks("no code")).toEqual([]);
  });

  it("flags a method the sources never mention", () => {
    expect(
      missingNames(
        code("import { z } from 'zod';\nz.object({}).fakeMethod();"),
        SOURCE,
      ),
    ).toEqual(["fakeMethod"]);
  });

  it("flags a package that is not in the sources, from import, require and install commands", () => {
    expect(missingNames(code("import x from 'made-up-lib';"), SOURCE)).toEqual([
      "made-up-lib",
    ]);
    expect(
      missingNames(code("const y = require('other-lib');"), SOURCE),
    ).toContain("other-lib");
    expect(missingNames(code("npm install invented-pkg"), SOURCE)).toEqual([
      "invented-pkg",
    ]);
  });

  it("flags an imported name the sources do not have", () => {
    expect(
      missingNames(code("import { z, nope } from 'zod';"), SOURCE),
    ).toEqual(["nope"]);
  });

  it("accepts names that do appear, including a sub-path of a known package", () => {
    expect(
      missingNames(
        code("import * as z from 'zod/v4';\nz.string().parse(1);"),
        SOURCE,
      ),
    ).toEqual([]);
    expect(missingNames(code("npm install zod"), SOURCE)).toEqual([]);
  });

  it("does not check built-ins, relative imports, Node modules or names the example defines", () => {
    const body = [
      "import fs from 'node:fs';",
      "import local from './local';",
      "function helper(value) { return value; }",
      "const total = (a, b) => a + b;",
      "console.log(helper(total(1, 2)), JSON.stringify([1]), [1].map((n) => n));",
    ].join("\n");
    expect(missingNames(code(body), SOURCE)).toEqual([]);
  });

  it("looks at code only, not at the prose around it", () => {
    expect(missingNames("Call fakeThing() whenever you like.", SOURCE)).toEqual(
      [],
    );
  });
});

describe("checkDraft", () => {
  it("passes a cited section whose code uses names from the sources", () => {
    const ok = draft(
      "Zod validates data at runtime and infers types [1].\n\n```ts\nz.string().parse('a');\n```",
    );
    expect(checkDraft(ok)).toEqual([]);
  });

  it("reports a section that cites no source at all", () => {
    const issues = checkDraft(
      draft("No sources anywhere in this section's text at all, sorry.", {
        citations: [],
      }),
    );
    expect(issues[0]).toBe("The section cites no source.");
  });

  it("reports a citation to a source that does not exist", () => {
    expect(
      checkDraft(
        draft("Zod validates data at runtime [1] and also does more [4]."),
      ),
    ).toContain("It cites sources that do not exist: 4.");
  });

  it("reports the number of uncited paragraphs with an example", () => {
    const text =
      "Zod validates data at runtime [1].\n\nThis second paragraph says things without any source at all.";
    const issues = checkDraft(draft(text));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(
      /^1 explanatory paragraph has no citation, e\.g\. "This second paragraph/,
    );
  });

  it("reports invented names in code", () => {
    const text =
      "Zod validates data at runtime [1].\n\n```ts\nz.string().inventedCall();\n```";
    expect(checkDraft(draft(text))).toEqual([
      "The code uses names that do not appear in the sources: inventedCall.",
    ]);
  });
});

describe("checkSections (the node)", () => {
  const good = draft(
    "Zod validates data at runtime and infers types from the schema [1].",
  );
  const bad = draft(
    "This paragraph has no citation at all, and it keeps going on a while.",
    {
      citations: [
        { n: 1, url: "https://zod.dev/basics", title: "Basic usage" },
      ],
    },
  );

  async function run(
    sections: Record<string, SectionDraft>,
    attempts: Record<string, number> = {},
  ) {
    const { deps, events } = fakeDeps();
    const update = await checkSections(
      stateWith({ sections, checkAttempts: attempts }),
      deps,
    );
    return {
      update,
      events,
      sections: update.sections as Record<string, SectionDraft>,
    };
  }

  it("marks a passing section ok and clears its old issues", async () => {
    const { sections } = await run({ a: { ...good, issues: ["old problem"] } });
    expect(sections.a.status).toBe("ok");
    expect(sections.a.issues).toBeUndefined();
  });

  it("keeps a failing section as a draft with its issues while rewrites are left", async () => {
    const { sections } = await run({ b: bad }, { b: MAX_REWRITES - 1 });
    expect(sections.b.status).toBe("draft");
    expect(sections.b.issues?.[0]).toMatch(/no citation/);
  });

  it("flags a failing section for review once its rewrites are used up", async () => {
    const { sections } = await run({ b: bad }, { b: MAX_REWRITES });
    expect(sections.b.status).toBe("needs_review");
    expect(sections.b.issues?.length).toBeGreaterThan(0);
  });

  it("looks only at sections still marked draft", async () => {
    const written = draft("Could not write.", {
      status: "needs_review",
      citations: [],
      sources: [],
    });
    const { sections, events } = await run({
      a: good,
      ok: { ...good, status: "ok" },
      nw: written,
    });
    expect(Object.keys(sections)).toEqual(["a"]);
    expect(events).toEqual([{ type: "checking", keys: ["a"] }]);
  });

  it("says nothing and changes nothing when there is nothing to check", async () => {
    const { sections, events, update } = await run({});
    expect(sections).toEqual({});
    expect(events).toEqual([]);
    expect(update.budget).toMatchObject({ steps: 1 });
  });

  it("allows exactly two rewrites", () => {
    expect(MAX_REWRITES).toBe(2);
  });
});
