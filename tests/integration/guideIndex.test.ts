import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { saveGuide } from "@/lib/agents/generate/guide/saveGuide";
import { indexGuide, type IndexableSection } from "@/lib/rag/guideIndex";
import { removeStaleGuideChunks } from "@/lib/rag/guideIndex/stale";
import type { Chunk } from "@/lib/rag/chunker";
import {
  storeChunks as store,
  upsertTechnology,
  type StoreInput,
} from "@/lib/rag/store";
import { createServiceClient } from "@/lib/supabase/service";

// Making a guide searchable, against the real local database, with a fake embedder (no cost).
// Everything is created under one throwaway technology and deleted at the end.

const db = createServiceClient();
const slug = `test-guideindex-${Date.now()}`;
let technology = {
  id: "",
  name: "Index test",
  slug,
  version: "1.0" as string | null,
};
let guideId = "";

const embed = vi.fn(async (texts: string[]) => ({
  embeddings: texts.map(() => Array.from({ length: 1536 }, () => 0.01)),
  tokens: texts.length * 7,
}));
const storeDeps = {
  db: () => db,
  embed,
  now: () => new Date("2026-01-01T00:00:00Z"),
};

const index = (sections: IndexableSection[]) =>
  indexGuide(
    { technology, guideId, sections },
    {
      store: (input: StoreInput) => store(input, storeDeps),
      removeStale: (id, keep) => removeStaleGuideChunks(db, id, keep),
    },
  );

const cited = [{ n: 1, url: "https://example.test/", title: "Example" }];
const section = (title: string, markdown: string): IndexableSection => ({
  title,
  markdown,
  citations: cited,
});

const guideChunks = async () => {
  const { data } = await db
    .from("chunks")
    .select("content, guide_id, source_id, source_type, expires_at")
    .eq("technology_id", technology.id)
    .eq("source_type", "guide");
  return data ?? [];
};

beforeAll(async () => {
  technology = {
    ...technology,
    id: await upsertTechnology(db, { name: "Index test", slug }),
  };
  const saved = await saveGuide(db, {
    technologyId: technology.id,
    status: "ready",
    sections: [],
  });
  guideId = saved.guideId;

  // a page of the official docs, which the guide's indexing must never touch
  const page: Chunk = {
    content: `Official docs text ${slug}`,
    headingPath: "Docs",
    tokens: 5,
  };
  await store(
    {
      technologyId: technology.id,
      source: {
        url: `https://example.test/${slug}`,
        title: "Docs",
        type: "official",
      },
      chunks: [page],
    },
    storeDeps,
  );
});

afterAll(async () => {
  await db.from("technologies").delete().eq("slug", slug); // guides, versions, chunks cascade
});

describe("indexGuide on the real database", () => {
  it("stores the guide's text tied to the guide, with no source page and no expiry", async () => {
    const result = await index([
      section("What it is", "Alpha explains the first idea clearly [1]."),
      section("Setup", "Beta explains how to install it [1]."),
    ]);
    expect(result).toEqual({ inserted: 2, removed: 0 });

    const rows = await guideChunks();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({
        guide_id: guideId,
        source_id: null,
        source_type: "guide",
        expires_at: null,
      });
      expect(row.content).not.toContain("[1]"); // markers are taken out
    }
  });

  it("indexing the same guide again changes nothing and embeds nothing", async () => {
    embed.mockClear();
    const result = await index([
      section("What it is", "Alpha explains the first idea clearly [1]."),
      section("Setup", "Beta explains how to install it [1]."),
    ]);
    expect(result).toEqual({ inserted: 0, removed: 0 });
    expect(embed).not.toHaveBeenCalled();
    expect(await guideChunks()).toHaveLength(2);
  });

  it("a new version keeps what is unchanged, adds what is new and drops what is gone", async () => {
    embed.mockClear();
    const result = await index([
      section("What it is", "Alpha explains the first idea clearly [1]."), // unchanged
      section("Setup", "Gamma now explains a different way to install it [1]."), // changed
    ]);
    expect(result).toEqual({ inserted: 1, removed: 1 });
    expect(embed).toHaveBeenCalledTimes(1);

    const text = (await guideChunks()).map((r) => r.content).join("\n");
    expect(text).toContain("Alpha explains");
    expect(text).toContain("Gamma now explains");
    expect(text).not.toContain("Beta explains"); // the chat can no longer cite the old text
  });

  it("never touches the official docs chunks of the same technology", async () => {
    await index([section("Only", "Delta is all that is left [1].")]);
    const { data } = await db
      .from("chunks")
      .select("content")
      .eq("technology_id", technology.id)
      .eq("source_type", "official");
    expect(data?.map((r) => r.content)).toEqual([`Official docs text ${slug}`]);
  });

  it("a version with no sourced section leaves no guide chunks, and still the docs", async () => {
    const result = await index([
      { title: "Note", markdown: "Could not be written.", citations: [] },
    ]);
    expect(result.inserted).toBe(0);
    expect(await guideChunks()).toEqual([]);

    const { count } = await db
      .from("chunks")
      .select("id", { count: "exact", head: true })
      .eq("technology_id", technology.id)
      .eq("source_type", "official");
    expect(count).toBe(1);
  });
});
