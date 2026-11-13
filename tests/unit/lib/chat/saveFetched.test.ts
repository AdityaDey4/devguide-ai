import { describe, expect, it, vi } from "vitest";
import { saveFetched } from "@/lib/chat/saveFetched";
import { contentHash, type StoreInput } from "@/lib/rag/store";

// Remembering what the chat found, with the store replaced by a fake: what is handed to it, and
// that one bad page loses only itself.

const page = (url: string, type: "official" | "context7" = "official") => ({
  url,
  title: `Title of ${url}`,
  type,
  markdown: `# Title\n\n${"This page explains the topic in detail. ".repeat(20)}`,
});

describe("saveFetched", () => {
  it("hands each page to the store with its source, type, fingerprint and chunks", async () => {
    const stored: StoreInput[] = [];
    const saved = await saveFetched(
      "t1",
      [page("https://a.dev/x"), page("https://github.com/s", "context7")],
      { store: async (input) => void stored.push(input) },
    );

    expect(saved).toBe(2);
    expect(stored.map((s) => s.source.type)).toEqual(["official", "context7"]);
    expect(stored[0]).toMatchObject({
      technologyId: "t1",
      source: {
        url: "https://a.dev/x",
        title: "Title of https://a.dev/x",
        contentHash: contentHash(page("https://a.dev/x").markdown),
      },
    });
    expect(stored[0].chunks.length).toBeGreaterThan(0);
    expect(stored[0].guideId).toBeUndefined(); // a fetched page, not our own guide's text
  });

  it("with nothing to save does nothing", async () => {
    const store = vi.fn();
    expect(await saveFetched("t1", [], { store })).toBe(0);
    expect(store).not.toHaveBeenCalled();
  });

  it("loses only the page that cannot be saved, logs it, and never throws", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const stored: string[] = [];
    const saved = await saveFetched(
      "t1",
      [page("https://a.dev/bad"), page("https://a.dev/good")],
      {
        store: async (input) => {
          if (input.source.url.endsWith("bad"))
            throw new Error("embeddings are down, key sk-secret");
          stored.push(input.source.url);
        },
      },
    );
    expect(saved).toBe(1);
    expect(stored).toEqual(["https://a.dev/good"]);
    expect(quiet).toHaveBeenCalledTimes(1);
    quiet.mockRestore();
  });
});
