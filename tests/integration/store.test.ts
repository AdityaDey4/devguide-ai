import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Chunk } from "@/lib/rag/chunker";
import { createStore, upsertTechnology } from "@/lib/rag/store";
import { createServiceClient } from "@/lib/supabase/service";

// Runs against the real local database (npx supabase start). The embedder is a fake that
// returns a 1,536-number vector without calling OpenAI, so this costs nothing.
// Everything is created under one throwaway technology and deleted at the end.

const db = createServiceClient();
const slug = `test-store-${Date.now()}`;
let technologyId = "";

const embed = vi.fn(async (texts: string[]) => ({
  embeddings: texts.map(() => Array.from({ length: 1536 }, () => 0.01)),
  tokens: texts.length * 7,
}));
const storeChunks = createStore({
  db: () => db,
  embed,
  now: () => new Date("2026-01-01T00:00:00Z"),
});

const chunk = (content: string): Chunk => ({
  content,
  headingPath: "Guide",
  tokens: 5,
});
const source = {
  url: `https://example.test/${slug}`,
  title: "Guide",
  type: "official" as const,
};

const countChunks = async () => {
  const { count } = await db
    .from("chunks")
    .select("id", { count: "exact", head: true })
    .eq("technology_id", technologyId);
  return count ?? 0;
};

beforeAll(async () => {
  technologyId = await upsertTechnology(db, { name: "Store test", slug });
});

afterAll(async () => {
  await db.from("technologies").delete().eq("slug", slug); // chunks and sources cascade
});

describe("storeChunks (real database)", () => {
  it("saves new chunks with a vector, hash and expiry", async () => {
    const result = await storeChunks({
      technologyId,
      source,
      chunks: [chunk("first"), chunk("second")],
    });
    expect(result).toMatchObject({
      total: 2,
      inserted: 2,
      skipped: 0,
      tokens: 14,
    });

    const { data } = await db
      .from("chunks")
      .select("content_hash, source_type, expires_at, heading_path")
      .eq("technology_id", technologyId);
    expect(data).toHaveLength(2);
    expect(data?.every((row) => /^[0-9a-f]{64}$/.test(row.content_hash))).toBe(
      true,
    );
    expect(data?.[0]).toMatchObject({
      source_type: "official",
      heading_path: "Guide",
      expires_at: "2026-04-01T00:00:00+00:00",
    });
  });

  it("running the same page again inserts nothing and never calls the embedder", async () => {
    embed.mockClear();
    const result = await storeChunks({
      technologyId,
      source,
      chunks: [chunk("first"), chunk("second")],
    });
    expect(result).toMatchObject({
      total: 2,
      inserted: 0,
      skipped: 2,
      tokens: 0,
    });
    expect(embed).not.toHaveBeenCalled();
    expect(await countChunks()).toBe(2);
  });

  it("embeds only the new chunk when one of two is already stored", async () => {
    embed.mockClear();
    const result = await storeChunks({
      technologyId,
      source,
      chunks: [chunk("first"), chunk("third")],
    });
    expect(result).toMatchObject({ inserted: 1, skipped: 1 });
    expect(embed).toHaveBeenCalledWith(["third"]);
    expect(await countChunks()).toBe(3);
  });

  it("counts the same text twice on one page once", async () => {
    const result = await storeChunks({
      technologyId,
      source,
      chunks: [chunk("repeat"), chunk("repeat"), chunk("repeat  \r\n")],
    });
    expect(result.inserted).toBe(1);
    expect(await countChunks()).toBe(4);
  });

  it("two runs at the same time cannot create duplicates", async () => {
    const chunks = [chunk("race one"), chunk("race two")];
    await Promise.all([
      storeChunks({ technologyId, source, chunks }),
      storeChunks({ technologyId, source, chunks }),
    ]);
    expect(await countChunks()).toBe(6);
  });

  it("keeps one source row per page", async () => {
    const { data } = await db
      .from("sources")
      .select("id")
      .eq("technology_id", technologyId)
      .eq("url", source.url);
    expect(data).toHaveLength(1);
  });
});
