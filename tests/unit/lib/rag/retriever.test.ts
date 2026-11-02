import { describe, expect, it, vi } from "vitest";
import { retrieve, RetrieveError } from "@/lib/rag/retriever";
import { mergeCandidates } from "@/lib/rag/retriever/merge";
import type { Candidate, RetrieveDeps } from "@/lib/rag/retriever/types";
import { cleanVariants } from "@/lib/rag/retriever/variants";
import type { ServiceClient } from "@/lib/supabase/service";

const candidate = (id: string, score: number): Candidate => ({
  id,
  content: `content ${id}`,
  headingPath: "Guide",
  sourceType: "official",
  sourceId: "s1",
  sourceUrl: "https://example.com/a",
  sourceTitle: "A",
  score,
});

/** The row shape hybrid_search returns. */
const row = (id: string, score: number) => ({
  id,
  content: `content ${id}`,
  heading_path: "Guide",
  source_type: "official",
  source_id: "s1",
  source_url: "https://example.com/a",
  source_title: "A",
  score,
});

describe("cleanVariants", () => {
  it("drops blank and repeated questions (ignoring case) and keeps at most 3", () => {
    expect(
      cleanVariants(["How?", "  ", "how?", " email schema ", "a", "b"]),
    ).toEqual(["How?", "email schema", "a"]);
  });

  it("returns nothing for nothing", () => {
    expect(cleanVariants([])).toEqual([]);
    expect(cleanVariants(["", "   "])).toEqual([]);
  });
});

describe("mergeCandidates", () => {
  it("lists a chunk found by several searches once, with its best score, best first", () => {
    const merged = mergeCandidates([
      [candidate("A", 0.033), candidate("B", 0.016)],
      [candidate("B", 0.032), candidate("C", 0.016)],
    ]);
    expect(merged.map((c) => [c.id, c.score])).toEqual([
      ["A", 0.033],
      ["B", 0.032],
      ["C", 0.016],
    ]);
  });

  it("handles no lists and empty lists", () => {
    expect(mergeCandidates([])).toEqual([]);
    expect(mergeCandidates([[], []])).toEqual([]);
  });
});

function setup(rowsFor: (query: string) => ReturnType<typeof row>[]) {
  const rpc = vi.fn(async (_name: string, args: { query_text: string }) => ({
    data: rowsFor(args.query_text),
    error: null as { message: string } | null,
  }));
  const embed = vi.fn(async (texts: string[]) => ({
    embeddings: texts.map((_, i) => [i, 0.5]),
    tokens: texts.length,
  }));
  const deps: RetrieveDeps = {
    db: () => ({ rpc }) as unknown as ServiceClient,
    embed,
  };
  return { rpc, embed, deps };
}

describe("retrieve", () => {
  it("embeds all variants in one call and runs one search per variant", async () => {
    const { rpc, embed, deps } = setup(() => []);
    await retrieve(
      { technologyId: "tech-1", queries: ["one", "two", "three"] },
      deps,
    );
    expect(embed).toHaveBeenCalledTimes(1);
    expect(embed).toHaveBeenCalledWith(["one", "two", "three"]);
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it("sends each search its own question and vector, and the technology", async () => {
    const { rpc, deps } = setup(() => []);
    await retrieve({ technologyId: "tech-1", queries: ["one", "two"] }, deps);
    const calls = rpc.mock.calls.map(([name, args]) => [name, args]);
    expect(calls).toContainEqual([
      "hybrid_search",
      expect.objectContaining({
        query_text: "one",
        query_embedding: "[0,0.5]",
        tech_id: "tech-1",
      }),
    ]);
    expect(calls).toContainEqual([
      "hybrid_search",
      expect.objectContaining({
        query_text: "two",
        query_embedding: "[1,0.5]",
      }),
    ]);
  });

  it("passes the guide id along", async () => {
    const { rpc, deps } = setup(() => []);
    await retrieve(
      { technologyId: "t", queries: ["q"], guideId: "guide-9" },
      deps,
    );
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_guide_id: "guide-9" });
  });

  it("merges the searches by chunk id and maps the columns to camelCase", async () => {
    const { deps } = setup((q) =>
      q === "one" ? [row("A", 0.03), row("B", 0.02)] : [row("B", 0.04)],
    );
    const result = await retrieve(
      { technologyId: "t", queries: ["one", "two"] },
      deps,
    );
    expect(result.map((c) => c.id)).toEqual(["B", "A"]);
    expect(result[0]).toEqual({
      id: "B",
      content: "content B",
      headingPath: "Guide",
      sourceType: "official",
      sourceId: "s1",
      sourceUrl: "https://example.com/a",
      sourceTitle: "A",
      score: 0.04,
    });
  });

  it("keeps at most 40 candidates", async () => {
    const many = Array.from({ length: 20 }, (_, i) => i);
    const { deps } = setup((q) =>
      many.map((i) => row(`${q}-${i}`, 1 / (i + 1))),
    );
    const result = await retrieve(
      { technologyId: "t", queries: ["a", "b", "c"] },
      deps,
    );
    expect(result).toHaveLength(40);
  });

  it("returns nothing, and calls nothing, when there is no question", async () => {
    const { rpc, embed, deps } = setup(() => []);
    expect(await retrieve({ technologyId: "t", queries: [" "] }, deps)).toEqual(
      [],
    );
    expect(embed).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports a database failure as a RetrieveError", async () => {
    const { rpc, deps } = setup(() => []);
    rpc.mockResolvedValue({ data: [], error: { message: "boom" } });
    await expect(
      retrieve({ technologyId: "t", queries: ["q"] }, deps),
    ).rejects.toBeInstanceOf(RetrieveError);
  });
});
