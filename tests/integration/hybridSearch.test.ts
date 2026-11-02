import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/supabase/service";

// The hybrid_search SQL function, against the real local database, with hand-made vectors
// (no OpenAI). Vector "axes" stand for meanings: axis 0 = "email", axis 1 = "date".

const db = createServiceClient();
const stamp = Date.now();
const slugs = [`test-hs-a-${stamp}`, `test-hs-b-${stamp}`];
const ids: Record<string, string> = {};

const axis = (n: number) =>
  JSON.stringify(Array.from({ length: 1536 }, (_, i) => (i === n ? 1 : 0)));

async function addChunk(
  tech: string,
  content: string,
  vectorAxis: number,
  extra: { expires_at?: string } = {},
) {
  const { error } = await db.from("chunks").insert({
    technology_id: ids[tech],
    source_type: "official",
    content,
    heading_path: "Guide",
    content_hash: `${stamp}-${content}`,
    embedding: axis(vectorAxis),
    ...extra,
  });
  if (error) throw error;
}

async function search(text: string, vectorAxis: number, tech = slugs[0]) {
  const { data, error } = await db.rpc("hybrid_search", {
    query_text: text,
    query_embedding: axis(vectorAxis),
    tech_id: ids[tech],
  });
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  for (const slug of slugs) {
    const { data, error } = await db
      .from("technologies")
      .insert({ name: slug, slug })
      .select("id")
      .single();
    if (error) throw error;
    ids[slug] = data.id;
  }
  const [a, b] = slugs;
  await addChunk(a, "validate an email address with the email schema", 0); // matches words and meaning
  await addChunk(a, "parse a calendar value", 1); // matches neither
  await addChunk(a, "email checking helper", 1); // matches words only
  await addChunk(a, "something unrelated about addresses of memory", 0); // matches meaning only
  await addChunk(a, "old email page", 0, {
    expires_at: "2020-01-01T00:00:00Z",
  });
  await addChunk(b, "email in another technology", 0);
});

afterAll(async () => {
  await db.from("technologies").delete().in("slug", slugs); // chunks cascade
});

describe("hybrid_search (real database)", () => {
  it("ranks a chunk that matches both by words and by meaning first", async () => {
    const rows = await search("validate email", 0);
    expect(rows[0].content).toContain("validate an email address");
  });

  it("also returns chunks that only one of the two lists found", async () => {
    const contents = (await search("validate email", 0)).map((r) => r.content);
    expect(contents).toContain("email checking helper"); // words only
    expect(contents).toContain("something unrelated about addresses of memory"); // meaning only
  });

  it("scores the chunk found by both lists higher than one found by a single list", async () => {
    const rows = await search("validate email", 0);
    expect(rows[0].score).toBeGreaterThan(rows[1].score);
  });

  it("leaves out expired chunks", async () => {
    const contents = (await search("email", 0)).map((r) => r.content);
    expect(contents).not.toContain("old email page");
  });

  it("never returns another technology's chunks", async () => {
    const contents = (await search("email", 0)).map((r) => r.content);
    expect(contents).not.toContain("email in another technology");
  });

  it("falls back to meaning when the question is only stop words", async () => {
    const rows = await search("how do I the", 0);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("respects match_count", async () => {
    const { data } = await db.rpc("hybrid_search", {
      query_text: "email",
      query_embedding: axis(0),
      tech_id: ids[slugs[0]],
      match_count: 2,
    });
    expect(data).toHaveLength(2);
  });
});
