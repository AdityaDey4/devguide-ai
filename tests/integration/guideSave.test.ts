import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  saveGuide,
  type GuideSection,
} from "@/lib/agents/generate/guide/saveGuide";
import { storeChunks } from "@/lib/rag/store";
import { createServiceClient } from "@/lib/supabase/service";

// Saving a finished guide in the real local database: the guide, its versions, its searchable
// text. No model is used (the embedder is a fake that returns a fixed 1,536-number vector).

const db = createServiceClient();
const stamp = Date.now();
let technologyId = "";

const axis = (n: number) =>
  Array.from({ length: 1536 }, (_, i) => (i === n ? 1 : 0));
const embed = async (texts: string[]) => ({
  embeddings: texts.map(() => axis(0)),
  tokens: texts.length,
});
const store = (input: Parameters<typeof storeChunks>[0]) =>
  storeChunks(input, { db: () => db, embed, now: () => new Date() });

const sections = (marker: string): GuideSection[] => [
  {
    key: "what-it-is",
    title: "What it is",
    markdown: `${marker} validates data at runtime [1].`,
    citations: [{ n: 1, url: "https://example.test/a", title: "A" }],
    needs_review: false,
  },
  {
    key: "gotchas",
    title: "Common mistakes",
    markdown: "Could not be written.",
    citations: [],
    needs_review: true,
  },
];

beforeAll(async () => {
  const slug = `test-guide-save-${stamp}`;
  const { data, error } = await db
    .from("technologies")
    .insert({ name: slug, slug })
    .select("id")
    .single();
  if (error) throw error;
  technologyId = data.id;
});

afterAll(async () => {
  await db.from("technologies").delete().eq("id", technologyId); // guides, chunks cascade
});

describe("saveGuide (real database)", () => {
  it("creates the shared guide with version 1 and points it at that version", async () => {
    const saved = await saveGuide(db, {
      technologyId,
      sections: sections("Zod"),
      status: "ready",
    });
    expect(saved.versionNo).toBe(1);

    const { data: guide } = await db
      .from("guides")
      .select("owner_id, status, current_version_id, last_refreshed_at")
      .eq("id", saved.guideId)
      .single();
    expect(guide).toMatchObject({
      owner_id: null,
      status: "ready",
      current_version_id: saved.versionId,
    });
    expect(guide?.last_refreshed_at).toBeTruthy();

    const { data: version } = await db
      .from("guide_versions")
      .select("author_type, sections")
      .eq("id", saved.versionId)
      .single();
    expect(version?.author_type).toBe("agent");
    expect(version?.sections).toEqual(sections("Zod")); // comes back exactly as saved
  });

  it("adds version 2 to the same guide when generated again, keeping version 1", async () => {
    const second = await saveGuide(db, {
      technologyId,
      sections: sections("Zod again"),
      status: "partial",
    });
    expect(second.versionNo).toBe(2);

    const { data: guides } = await db
      .from("guides")
      .select("id, status, current_version_id")
      .eq("technology_id", technologyId);
    expect(guides).toHaveLength(1); // still one shared guide
    expect(guides?.[0]).toMatchObject({
      id: second.guideId,
      status: "partial",
      current_version_id: second.versionId,
    });

    const { data: versions } = await db
      .from("guide_versions")
      .select("version_no")
      .eq("guide_id", second.guideId)
      .order("version_no");
    expect(versions?.map((v) => v.version_no)).toEqual([1, 2]);
  });
});

describe("the guide's own text in the knowledge base", () => {
  let guideId = "";
  let otherGuideId = "";

  beforeAll(async () => {
    const { data } = await db
      .from("guides")
      .select("id")
      .eq("technology_id", technologyId)
      .single();
    guideId = data!.id;
    // A second guide (a fork) of the same technology, to prove guides do not leak into each other.
    const { data: user } = await db.auth.admin.createUser({
      email: `fork-${stamp}@guide-test.local`,
      password: crypto.randomUUID(),
      email_confirm: true,
    });
    const { data: fork } = await db
      .from("guides")
      .insert({ technology_id: technologyId, owner_id: user.user!.id })
      .select("id")
      .single();
    otherGuideId = fork!.id;
  });

  afterAll(async () => {
    const { data } = await db.auth.admin.listUsers();
    for (const user of data.users) {
      if (user.email?.endsWith(`fork-${stamp}@guide-test.local`)) {
        await db.auth.admin.deleteUser(user.id);
      }
    }
  });

  const search = async (text: string, p_guide_id?: string) => {
    const { data, error } = await db.rpc("hybrid_search", {
      query_text: text,
      query_embedding: JSON.stringify(axis(0)),
      tech_id: technologyId,
      p_guide_id,
    });
    if (error) throw error;
    return data;
  };

  it("is saved tied to the guide, with no source page and no expiry", async () => {
    const result = await store({
      technologyId,
      guideId,
      source: { url: "guide:test", title: "Test guide", type: "guide" },
      chunks: [
        {
          content: "Zod guide: it validates data at runtime",
          headingPath: "Zod guide: What it is",
          tokens: 8,
        },
      ],
    });
    expect(result.sourceId).toBeNull();
    expect(result.inserted).toBe(1);

    const { data: chunk } = await db
      .from("chunks")
      .select("guide_id, source_id, source_type, expires_at")
      .eq("guide_id", guideId)
      .single();
    expect(chunk).toMatchObject({
      guide_id: guideId,
      source_id: null,
      source_type: "guide",
      expires_at: null,
    });

    const { count } = await db
      .from("sources")
      .select("id", { count: "exact", head: true })
      .eq("technology_id", technologyId);
    expect(count).toBe(0); // no fake "page" was recorded
  });

  it("is found by the search for its own guide, without a source address", async () => {
    const rows = await search("validates data at runtime", guideId);
    expect(rows.map((r) => r.content)).toContain(
      "Zod guide: it validates data at runtime",
    );
    expect(rows.find((r) => r.source_type === "guide")?.source_url).toBeNull();
  });

  it("is not found when no guide is named, or when another guide is", async () => {
    const without = await search("validates data at runtime");
    const other = await search("validates data at runtime", otherGuideId);
    expect(without.map((r) => r.source_type)).not.toContain("guide");
    expect(other.map((r) => r.source_type)).not.toContain("guide");
  });

  it("is replaced, not piled up, when the guide is generated again", async () => {
    await saveGuide(db, {
      technologyId,
      sections: sections("Zod third"),
      status: "ready",
    });
    const { count } = await db
      .from("chunks")
      .select("id", { count: "exact", head: true })
      .eq("guide_id", guideId);
    expect(count).toBe(0); // the old text is gone; the new text is stored by assembleGuide
  });
});
