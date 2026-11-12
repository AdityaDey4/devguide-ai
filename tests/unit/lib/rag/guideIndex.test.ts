import { describe, expect, it, vi } from "vitest";
import { withoutMarkers } from "@/lib/guide/citations";
import { indexGuide, type IndexGuideDeps } from "@/lib/rag/guideIndex";
import { contentHash } from "@/lib/rag/store";
import type { StoreInput } from "@/lib/rag/store";

// The step that makes a saved guide searchable (SRS FR-KB-8), with the store and the cleanup
// replaced by fakes: which text is stored, how, and what is dropped.

const technology = { id: "t1", name: "Zod", slug: "zod", version: "4.1.0" };
const cited = [{ n: 1, url: "https://zod.dev/", title: "Zod" }];

function setup(removed = 0) {
  const stored: StoreInput[] = [];
  const removeStale = vi.fn(async () => removed);
  const deps: IndexGuideDeps = {
    store: async (input) => {
      stored.push(input);
      return {
        sourceId: null,
        total: input.chunks.length,
        inserted: input.chunks.length,
        skipped: 0,
        tokens: 1,
      };
    },
    removeStale,
  };
  return { deps, stored, removeStale };
}

describe("indexGuide", () => {
  it("stores all the sections in one go, tied to the guide, with no source page", async () => {
    const { deps, stored } = setup();
    await indexGuide(
      {
        technology,
        guideId: "g1",
        sections: [
          {
            title: "What it is",
            markdown: "Zod validates data.",
            citations: cited,
          },
          { title: "Setup", markdown: "Install zod.", citations: cited },
        ],
      },
      deps,
    );

    expect(stored).toHaveLength(1); // one call: one embedding batch
    expect(stored[0]).toMatchObject({
      technologyId: "t1",
      guideId: "g1",
      techVersion: "4.1.0",
      source: { url: "guide:zod", title: "Zod guide", type: "guide" },
    });
    expect(stored[0].chunks.map((c) => c.headingPath)).toEqual([
      expect.stringContaining("Zod guide: What it is"),
      expect.stringContaining("Zod guide: Setup"),
    ]);
  });

  it("takes the [n] markers out of the text it stores, but not out of code", async () => {
    const { deps, stored } = setup();
    await indexGuide(
      {
        technology,
        guideId: "g1",
        sections: [
          {
            title: "Use",
            markdown:
              "Zod parses data [1]. Index with `a[1]`.\n\n```ts\nconst x = a[1];\n```\n",
            citations: cited,
          },
        ],
      },
      deps,
    );
    const text = stored[0].chunks.map((c) => c.content).join("\n");
    expect(text).toContain("Zod parses data.");
    expect(text).not.toContain("data [1]");
    expect(text).toContain("`a[1]`");
    expect(text).toContain("const x = a[1];");
  });

  it("leaves out sections that cite nothing (they are only 'could not be written' notes)", async () => {
    const { deps, stored } = setup();
    await indexGuide(
      {
        technology,
        guideId: "g1",
        sections: [
          { title: "Good", markdown: "Real text.", citations: cited },
          {
            title: "Missing",
            markdown: "Could not be written.",
            citations: [],
          },
        ],
      },
      deps,
    );
    const text = stored[0].chunks.map((c) => c.content).join("\n");
    expect(text).toContain("Real text.");
    expect(text).not.toContain("Could not be written");
  });

  it("drops the chunks that are not in the new text, keeping exactly the new ones", async () => {
    const { deps, stored, removeStale } = setup(4);
    const result = await indexGuide(
      {
        technology,
        guideId: "g1",
        sections: [{ title: "A", markdown: "Some text.", citations: cited }],
      },
      deps,
    );

    expect(removeStale).toHaveBeenCalledWith(
      "g1",
      stored[0].chunks.map((c) => contentHash(c.content)),
    );
    expect(result).toEqual({ inserted: 1, removed: 4 });
  });

  it("with nothing to store, stores nothing and drops all of the guide's old chunks", async () => {
    const { deps, stored, removeStale } = setup(2);
    const result = await indexGuide(
      {
        technology,
        guideId: "g1",
        sections: [{ title: "A", markdown: "Note.", citations: [] }],
      },
      deps,
    );
    expect(stored).toEqual([]);
    expect(removeStale).toHaveBeenCalledWith("g1", []);
    expect(result).toEqual({ inserted: 0, removed: 2 });
  });

  it("does not send a version when the technology has none", async () => {
    const { deps, stored } = setup();
    await indexGuide(
      {
        technology: { ...technology, version: null },
        guideId: "g1",
        sections: [{ title: "A", markdown: "Text.", citations: cited }],
      },
      deps,
    );
    expect("techVersion" in stored[0]).toBe(false);
  });
});

describe("withoutMarkers", () => {
  it("removes the marker and the space before it, so no gap is left before punctuation", () => {
    expect(withoutMarkers("Zod parses data [1]. Then [2][3] more.")).toBe(
      "Zod parses data. Then more.",
    );
  });

  it("leaves code and text without markers as they are", () => {
    const text = "Use `a[1]` and:\n\n```\nb[2]\n```\n";
    expect(withoutMarkers(text)).toBe(text);
  });
});
