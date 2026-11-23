import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  saveGuide,
  type GuideSection,
} from "@/lib/agents/generate/guide/saveGuide";
import { purgeExpired } from "@/lib/chat/cache";
import { createServiceClient } from "@/lib/supabase/service";

// Step 5 of the semantic cache, against the real local database: cached answers go away when
// their guide's current version changes, and expired ones are purged. All rows are throwaway.

const db = createServiceClient();
const stamp = Date.now();
const slugA = `test-cache-inval-a-${stamp}`;
const slugB = `test-cache-inval-b-${stamp}`;

type Side = { technologyId: string; guideId: string; versionId: string };
let a: Side;
let b: Side;

const sections: GuideSection[] = [
  {
    key: "install",
    title: "Installation",
    markdown: "Run `npm i thing` [1].",
    citations: [{ n: 1, url: "https://example.test/a", title: "A" }],
    needs_review: false,
  },
];
const zero = `[${Array(1536).fill(0).join(",")}]`;

async function makeSide(slug: string): Promise<Side> {
  const tech = await db
    .from("technologies")
    .insert({ name: slug, slug })
    .select("id")
    .single();
  if (tech.error) throw tech.error;
  const { guideId } = await saveGuide(db, {
    technologyId: tech.data.id,
    sections,
    status: "ready",
  });
  const guide = await db
    .from("guides")
    .select("current_version_id")
    .eq("id", guideId)
    .single();
  return {
    technologyId: tech.data.id,
    guideId,
    versionId: guide.data!.current_version_id!,
  };
}

async function cacheRow(
  side: Side,
  question: string,
  expiresInMs = 86_400_000,
) {
  const { error } = await db.from("chat_cache").insert({
    technology_id: side.technologyId,
    guide_id: side.guideId,
    guide_version_id: side.versionId,
    question,
    question_embedding: zero,
    answer: "An answer [1].",
    citations: [],
    origin: "guide",
    expires_at: new Date(Date.now() + expiresInMs).toISOString(),
  });
  if (error) throw error;
}

const countFor = async (side: Side) =>
  (
    await db
      .from("chat_cache")
      .select("id", { count: "exact", head: true })
      .eq("guide_id", side.guideId)
  ).count;

beforeAll(async () => {
  a = await makeSide(slugA);
  b = await makeSide(slugB);
});

afterAll(async () => {
  await db.from("technologies").delete().in("slug", [slugA, slugB]);
});

describe("when a guide's current version changes", () => {
  it("deletes that guide's cached answers, and only that guide's", async () => {
    await cacheRow(a, "one");
    await cacheRow(a, "two");
    await cacheRow(b, "other guide");
    expect(await countFor(a)).toBe(2);

    const next = await db
      .from("guide_versions")
      .insert({
        guide_id: a.guideId,
        version_no: 2,
        sections,
        author_type: "agent",
        change_note: "Regenerated",
      })
      .select("id")
      .single();
    if (next.error) throw next.error;
    const moved = await db
      .from("guides")
      .update({ current_version_id: next.data.id })
      .eq("id", a.guideId);
    expect(moved.error).toBeNull();

    expect(await countFor(a)).toBe(0);
    expect(await countFor(b)).toBe(1);
  });

  it("keeps the answers when the guide is updated without a new version", async () => {
    await cacheRow(b, "second");
    expect(await countFor(b)).toBe(2);
    const touched = await db
      .from("guides")
      .update({ status: "ready" })
      .eq("id", b.guideId);
    expect(touched.error).toBeNull();
    expect(await countFor(b)).toBe(2);
  });
});

describe("purgeExpired", () => {
  it("deletes only the answers whose time is up", async () => {
    await cacheRow(b, "already expired", -60_000);
    expect(await countFor(b)).toBe(3);

    expect(await purgeExpired(db)).toBeGreaterThanOrEqual(1);
    expect(await countFor(b)).toBe(2);

    expect(await purgeExpired(db)).toBe(0); // nothing left to delete
  });
});
