import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  saveGuide,
  type GuideSection,
} from "@/lib/agents/generate/guide/saveGuide";
import {
  cacheScope,
  lookupCachedAnswer,
  saveCachedAnswer,
  type CacheScope,
} from "@/lib/chat/cache";
import { createServiceClient } from "@/lib/supabase/service";

// The cache module against the real local table (step 2 of the semantic cache): save, then find,
// with a fake embedder so no model is called. All rows are throwaway.

const db = createServiceClient();
const stamp = Date.now();
const slug = `test-cache-module-${stamp}`;
let scope: CacheScope;
let sharedId = "";
let copyId = "";
const owner = { id: "", email: `owner-${stamp}@cache-test.local` };

const sections: GuideSection[] = [
  {
    key: "install",
    title: "Installation",
    markdown: "Run `npm i thing` [1].",
    citations: [{ n: 1, url: "https://example.test/a", title: "A" }],
    needs_review: false,
  },
];

// Each question gets a made-up vector; the cosine similarity between them is known.
const vectors: Record<string, number[]> = {
  "How do I install it?": [1, 0],
  "How can I install it?": [1, 0.1], // cosine 0.995 with the first
  "How do I deploy it?": [0, 1], // unrelated
};
const embed = async (text: string) => {
  const head = vectors[text];
  if (!head) throw new Error(`no vector for "${text}"`);
  return head.concat(Array(1536 - head.length).fill(0));
};
const deps = { embed, now: () => new Date() };

const citations = [
  {
    n: 1,
    title: "Install",
    url: "https://example.test/i",
    kind: "docs" as const,
  },
];
const toSave = (question: string) => ({
  question,
  answer: `Answer to: ${question}`,
  citations,
  origin: "stored_docs",
  grade: "GOOD",
});

beforeAll(async () => {
  const tech = await db
    .from("technologies")
    .insert({ name: slug, slug })
    .select("id")
    .single();
  if (tech.error) throw tech.error;
  sharedId = (
    await saveGuide(db, {
      technologyId: tech.data.id,
      sections,
      status: "ready",
    })
  ).guideId;

  // a person's copy of the same technology's guide
  const created = await db.auth.admin.createUser({
    email: owner.email,
    password: crypto.randomUUID(),
    email_confirm: true,
  });
  if (created.error) throw created.error;
  owner.id = created.data.user.id;
  const copy = await db
    .from("guides")
    .insert({
      technology_id: tech.data.id,
      owner_id: owner.id,
      forked_from: sharedId,
      status: "ready",
    })
    .select("id")
    .single();
  if (copy.error) throw copy.error;
  copyId = copy.data.id;
});

afterAll(async () => {
  await db.from("technologies").delete().eq("slug", slug);
  if (owner.id) await db.auth.admin.deleteUser(owner.id);
});

describe("the cache module on the real table", () => {
  it("finds the scope of the shared guide", async () => {
    const found = await cacheScope(db, {
      technology: { id: "x" } as never,
      guideId: sharedId,
      hiddenHashes: [],
    });
    expect(found).not.toBeNull();
    scope = found!;
    expect(scope.guideId).toBe(sharedId);
    expect(scope.guideVersionId).toBeTruthy();
  });

  it("never caches a person's copy, nor a chat that also searches one", async () => {
    const chat = { technology: { id: "x" } as never, hiddenHashes: [] };
    expect(await cacheScope(db, { ...chat, guideId: copyId })).toBeNull();
    expect(
      await cacheScope(db, { ...chat, guideId: copyId, alsoGuideId: sharedId }),
    ).toBeNull();
  });

  it("misses before anything is saved, and hits after", async () => {
    expect(
      await lookupCachedAnswer(db, scope, "How do I install it?", deps),
    ).toBeNull();
    expect(
      await saveCachedAnswer(db, scope, toSave("How do I install it?"), deps),
    ).toBe(true);

    const hit = await lookupCachedAnswer(
      db,
      scope,
      "How do I install it?",
      deps,
    );
    expect(hit).toMatchObject({
      answer: "Answer to: How do I install it?",
      origin: "stored_docs",
      citations,
    });
    expect(hit!.similarity).toBeCloseTo(1, 5);
  });

  it("answers a question that means almost the same from the saved one", async () => {
    const hit = await lookupCachedAnswer(
      db,
      scope,
      "How can I install it?",
      deps,
    );
    expect(hit?.answer).toBe("Answer to: How do I install it?");
  });

  it("counts each hit on the saved answer", async () => {
    await new Promise((resolve) => setTimeout(resolve, 300)); // counts from earlier lookups land
    const before = await db
      .from("chat_cache")
      .select("hit_count")
      .eq("guide_id", sharedId)
      .eq("question", "How do I install it?")
      .single();
    await lookupCachedAnswer(db, scope, "How do I install it?", deps);
    await lookupCachedAnswer(db, scope, "How do I install it?", deps);
    await new Promise((resolve) => setTimeout(resolve, 300)); // counted in the background
    const after = await db
      .from("chat_cache")
      .select("hit_count")
      .eq("guide_id", sharedId)
      .eq("question", "How do I install it?")
      .single();
    expect(after.data!.hit_count).toBe(before.data!.hit_count + 2);
  });

  it("does not answer an unrelated question", async () => {
    expect(
      await lookupCachedAnswer(db, scope, "How do I deploy it?", deps),
    ).toBeNull();
  });

  it("does not save the same question twice, nor a near-identical one", async () => {
    expect(
      await saveCachedAnswer(db, scope, toSave("How do I install it?"), deps),
    ).toBe(false);
    expect(
      await saveCachedAnswer(db, scope, toSave("How can I install it?"), deps),
    ).toBe(false);
    const { count } = await db
      .from("chat_cache")
      .select("id", { count: "exact", head: true })
      .eq("guide_id", sharedId);
    expect(count).toBe(1);
  });

  it("does not save a refusal, and keeps unrelated questions apart", async () => {
    expect(
      await saveCachedAnswer(
        db,
        scope,
        { ...toSave("How do I deploy it?"), origin: "not_found" },
        deps,
      ),
    ).toBe(false);
    expect(
      await saveCachedAnswer(db, scope, toSave("How do I deploy it?"), deps),
    ).toBe(true);
    expect(
      (await lookupCachedAnswer(db, scope, "How do I deploy it?", deps))
        ?.answer,
    ).toBe("Answer to: How do I deploy it?");
  });

  it("does not serve an answer to another guide version", async () => {
    const other = { ...scope, guideVersionId: crypto.randomUUID() };
    expect(
      await lookupCachedAnswer(db, other, "How do I install it?", deps),
    ).toBeNull();
  });

  it("is a miss, not an error, when the embedding fails", async () => {
    const failing = {
      ...deps,
      embed: async () => {
        throw new Error("no key");
      },
    };
    const quiet = console.error;
    console.error = () => {};
    try {
      expect(
        await lookupCachedAnswer(db, scope, "How do I install it?", failing),
      ).toBeNull();
    } finally {
      console.error = quiet;
    }
  });
});
