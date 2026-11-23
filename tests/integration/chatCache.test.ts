import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  saveGuide,
  type GuideSection,
} from "@/lib/agents/generate/guide/saveGuide";
import type { Database } from "@/lib/supabase/database.types";
import { createServiceClient } from "@/lib/supabase/service";

// The chat cache table and its lookup function (step 1 of the semantic cache), against the real
// local database. The embeddings are made-up short vectors with known cosine similarity, so no
// model is called. All rows are throwaway.

const db = createServiceClient();
const stamp = Date.now();
const slug = `test-chat-cache-${stamp}`;
const otherSlug = `${slug}-other`;
let technologyId = "";
let otherTechnologyId = "";
let guideId = "";
let versionId = "";
let newerVersionId = "";
const person = {
  id: "",
  email: `cache-${stamp}@cache-test.local`,
  password: crypto.randomUUID(),
};

const sections: GuideSection[] = [
  {
    key: "install",
    title: "Installation",
    markdown: "Run `npm i thing` [1].",
    citations: [{ n: 1, url: "https://example.test/a", title: "A" }],
    needs_review: false,
  },
];

/** A 1536-number vector that starts with `head` and is zero after. */
const vec = (...head: number[]) =>
  `[${head.concat(Array(1536 - head.length).fill(0)).join(",")}]`;

const CITATIONS = [{ n: 1, title: "A", url: "https://example.test/a" }];

async function put(
  fields: Partial<Database["public"]["Tables"]["chat_cache"]["Insert"]> & {
    question_embedding: string;
  },
) {
  const { error } = await db.from("chat_cache").insert({
    technology_id: technologyId,
    guide_id: guideId,
    guide_version_id: versionId,
    question: "How do I install it?",
    answer: "Run npm i thing [1].",
    citations: CITATIONS,
    origin: "guide",
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    ...fields,
  });
  if (error) throw error;
}

const find = (
  embedding: string,
  options: { tech?: string; version?: string; min?: number } = {},
) =>
  db.rpc("match_chat_cache", {
    query_embedding: embedding,
    p_technology_id: options.tech ?? technologyId,
    p_guide_version_id: options.version ?? versionId,
    ...(options.min === undefined ? {} : { min_similarity: options.min }),
  });

beforeAll(async () => {
  const tech = await db
    .from("technologies")
    .insert({ name: slug, slug })
    .select("id")
    .single();
  if (tech.error) throw tech.error;
  technologyId = tech.data.id;
  const other = await db
    .from("technologies")
    .insert({ name: otherSlug, slug: otherSlug })
    .select("id")
    .single();
  if (other.error) throw other.error;
  otherTechnologyId = other.data.id;

  guideId = (await saveGuide(db, { technologyId, sections, status: "ready" }))
    .guideId;
  const guide = await db
    .from("guides")
    .select("current_version_id")
    .eq("id", guideId)
    .single();
  versionId = guide.data!.current_version_id!;
  // a second version of the same guide, to prove rows belong to one version
  const next = await db
    .from("guide_versions")
    .select("id")
    .eq("guide_id", guideId)
    .neq("id", versionId)
    .limit(1);
  newerVersionId = next.data?.[0]?.id ?? crypto.randomUUID();

  const created = await db.auth.admin.createUser({
    email: person.email,
    password: person.password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  person.id = created.data.user.id;

  await put({ question_embedding: vec(1, 0) });
});

afterAll(async () => {
  await db.from("technologies").delete().in("slug", [slug, otherSlug]); // everything cascades
  if (person.id) await db.auth.admin.deleteUser(person.id);
});

describe("match_chat_cache", () => {
  it("returns the answer for the same question, with similarity 1", async () => {
    const { data, error } = await find(vec(1, 0));
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({
      answer: "Run npm i thing [1].",
      citations: CITATIONS,
      origin: "guide",
    });
    expect(data![0].similarity).toBeCloseTo(1, 5);
  });

  it("returns a question that means almost the same (cosine 0.995)", async () => {
    const { data } = await find(vec(1, 0.1));
    expect(data).toHaveLength(1);
    expect(data![0].similarity).toBeGreaterThan(0.99);
  });

  it("returns nothing for a question that is only somewhat close (cosine 0.89)", async () => {
    expect((await find(vec(1, 0.5))).data).toEqual([]);
    expect((await find(vec(0, 1))).data).toEqual([]);
  });

  it("lets the caller loosen or tighten the threshold", async () => {
    expect((await find(vec(1, 0.5), { min: 0.85 })).data).toHaveLength(1);
    expect((await find(vec(1, 0.1), { min: 0.999 })).data).toEqual([]);
  });

  it("never crosses technologies or guide versions", async () => {
    expect((await find(vec(1, 0), { tech: otherTechnologyId })).data).toEqual(
      [],
    );
    expect(
      (await find(vec(1, 0), { version: crypto.randomUUID() })).data,
    ).toEqual([]);
    if (newerVersionId) {
      expect((await find(vec(1, 0), { version: newerVersionId })).data).toEqual(
        [],
      );
    }
  });

  it("ignores an expired row", async () => {
    await put({
      question: "old question",
      question_embedding: vec(0, 0, 1),
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    expect((await find(vec(0, 0, 1))).data).toEqual([]);
  });

  it("returns the nearest one when several are close", async () => {
    await put({
      question: "closer",
      answer: "Closer answer",
      question_embedding: vec(0, 0, 0, 1, 0.05),
    });
    await put({
      question: "farther",
      answer: "Farther answer",
      question_embedding: vec(0, 0, 0, 1, 0.2),
    });
    const { data } = await find(vec(0, 0, 0, 1, 0.04), { min: 0.9 });
    expect(data).toHaveLength(1);
    expect(data![0].answer).toBe("Closer answer");
  });
});

describe("who can use the cache", () => {
  it("is closed to signed-in users: no direct reads, no lookups", async () => {
    const client = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const login = await client.auth.signInWithPassword(person);
    if (login.error) throw login.error;

    const read = await client.from("chat_cache").select("id");
    expect(read.data ?? []).toEqual([]); // Row Level Security: no policy, no rows

    const lookup = await client.rpc("match_chat_cache", {
      query_embedding: vec(1, 0),
      p_technology_id: technologyId,
      p_guide_version_id: versionId,
    });
    expect(lookup.error).not.toBeNull(); // no permission to run it
  });
});
