import { describe, expect, it, vi } from "vitest";
import { NOT_COVERED } from "@/lib/agents/chat/config";
import {
  cacheScope,
  lookupCachedAnswer,
  normaliseQuestion,
  purgeExpired,
  refuseToCache,
  saveCachedAnswer,
  type AnswerToCache,
  type CacheScope,
} from "@/lib/chat/cache";
import {
  DUPLICATE_SIMILARITY,
  MAX_QUESTION_CHARS,
  MIN_SIMILARITY,
  TTL_DAYS,
} from "@/lib/chat/cache/config";

// The cache rules, with the database and the embedding replaced by fakes: what is looked up,
// what is saved and what is refused. The real table is tested in tests/integration/chatCache.test.ts.

const scope: CacheScope = {
  technologyId: "t1",
  guideId: "g1",
  guideVersionId: "v1",
};
const citations = [
  { n: 1, title: "Install", url: "https://x.test/i", kind: "docs" as const },
];
const good: AnswerToCache = {
  question: "How do I install it?",
  answer: "Run npm i thing [1].",
  citations,
  origin: "stored_docs",
  grade: "GOOD",
};
const NOW = new Date("2026-11-19T10:00:00Z");

/** A fake database: `rpc` answers with `rows`, `insert` records what is saved. */
function fakeDb(rows: unknown[] = [], options: { insertError?: boolean } = {}) {
  const inserted: Record<string, unknown>[] = [];
  const rpc = vi.fn(async (..._args: unknown[]) => ({
    data: rows,
    error: null,
  }));
  const purged: string[] = [];
  const db = {
    rpc,
    from: (table: string) => ({
      delete: () => ({
        lt: async (_column: string, before: string) => {
          purged.push(before);
          return { count: 2, error: null };
        },
      }),
      insert: async (row: Record<string, unknown>) => {
        if (table !== "chat_cache") throw new Error(`wrote to ${table}`);
        inserted.push(row);
        return { error: options.insertError ? new Error("down") : null };
      },
    }),
  };
  return { db: db as never, inserted, rpc, purged };
}
const deps = (
  embed: (text: string) => Promise<number[]> = async () => [1, 0, 0],
) => ({
  embed,
  now: () => NOW,
});
const hitRow = {
  id: "c1",
  question: "How do I install?",
  answer: "Run npm i thing [1].",
  citations,
  origin: "guide",
  similarity: 0.97,
};

describe("lookupCachedAnswer", () => {
  it("asks for the nearest row of this technology and guide version, at the minimum similarity", async () => {
    const f = fakeDb([hitRow]);
    const hit = await lookupCachedAnswer(
      f.db,
      scope,
      "How do I install?",
      deps(),
    );
    expect(hit).toMatchObject({
      id: "c1",
      answer: "Run npm i thing [1].",
      origin: "guide",
    });
    expect(f.rpc).toHaveBeenCalledWith("match_chat_cache", {
      query_embedding: "[1,0,0]",
      p_technology_id: "t1",
      p_guide_version_id: "v1",
      min_similarity: MIN_SIMILARITY,
    });
  });

  it("counts the hit in the background, and a failed count does not matter", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fakeDb([hitRow]);
    expect(await lookupCachedAnswer(f.db, scope, "q", deps())).toMatchObject({
      id: "c1",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(f.rpc).toHaveBeenCalledWith("record_chat_cache_hit", { p_id: "c1" });

    const missing = fakeDb([]);
    await lookupCachedAnswer(missing.db, scope, "q", deps());
    expect(missing.rpc).toHaveBeenCalledTimes(1); // only the search: nothing to count
  });

  it("is a miss when nothing is close", async () => {
    expect(
      await lookupCachedAnswer(fakeDb([]).db, scope, "q", deps()),
    ).toBeNull();
  });

  it("embeds the question with its whitespace squeezed", async () => {
    const embed = vi.fn(async (_text: string) => [1]);
    await lookupCachedAnswer(
      fakeDb().db,
      scope,
      "  How   do I\n install? ",
      deps(embed),
    );
    expect(embed).toHaveBeenCalledWith("How do I install?");
  });

  it("does not look up an empty or very long question", async () => {
    const f = fakeDb([hitRow]);
    expect(await lookupCachedAnswer(f.db, scope, "   ", deps())).toBeNull();
    expect(
      await lookupCachedAnswer(
        f.db,
        scope,
        "x".repeat(MAX_QUESTION_CHARS + 1),
        deps(),
      ),
    ).toBeNull();
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("is a miss, not an error, when the database or the embedding fails or the row is damaged", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = {
      rpc: async () => ({ data: null, error: new Error("down") }),
    } as never;
    expect(await lookupCachedAnswer(broken, scope, "q", deps())).toBeNull();

    const noEmbed = deps(async () => {
      throw new Error("no key");
    });
    expect(
      await lookupCachedAnswer(fakeDb([hitRow]).db, scope, "q", noEmbed),
    ).toBeNull();

    const damaged = fakeDb([{ ...hitRow, citations: "oops" }]);
    expect(await lookupCachedAnswer(damaged.db, scope, "q", deps())).toBeNull();
  });
});

describe("refuseToCache", () => {
  it("accepts a cited answer from the guide, stored docs or a live fetch", () => {
    for (const origin of ["guide", "stored_docs", "fetched_now"]) {
      expect(refuseToCache({ ...good, origin })).toBeNull();
    }
  });

  it("refuses a refusal, a direct reply, an empty answer and one without citations", () => {
    expect(refuseToCache({ ...good, origin: "not_found" })).toBe("origin");
    expect(refuseToCache({ ...good, origin: "none" })).toBe("origin");
    expect(refuseToCache({ ...good, answer: "  " })).toBe("answer");
    expect(refuseToCache({ ...good, answer: NOT_COVERED })).toBe("answer");
    expect(refuseToCache({ ...good, citations: [] })).toBe("no citations");
  });

  it("refuses an answer whose text was not graded GOOD", () => {
    expect(refuseToCache({ ...good, grade: "PARTIAL" })).toBe("grade");
    expect(refuseToCache({ ...good, grade: "BAD" })).toBe("grade");
    expect(refuseToCache({ ...good, grade: null })).toBe("grade");
  });

  it("refuses an empty or very long question", () => {
    expect(refuseToCache({ ...good, question: " " })).toBe("question");
    expect(
      refuseToCache({ ...good, question: "x".repeat(MAX_QUESTION_CHARS + 1) }),
    ).toBe("question");
  });
});

describe("saveCachedAnswer", () => {
  it("saves a good answer for this scope, with the question as normalised and an expiry", async () => {
    const f = fakeDb([]);
    const saved = await saveCachedAnswer(
      f.db,
      scope,
      { ...good, question: "  How do I   install it? " },
      deps(),
    );
    expect(saved).toBe(true);
    expect(f.inserted).toEqual([
      {
        technology_id: "t1",
        guide_id: "g1",
        guide_version_id: "v1",
        question: "How do I install it?",
        question_embedding: "[1,0,0]",
        answer: "Run npm i thing [1].",
        citations,
        origin: "stored_docs",
        expires_at: new Date(
          NOW.getTime() + TTL_DAYS * 86_400_000,
        ).toISOString(),
      },
    ]);
  });

  it("deletes the expired answers when it saves one", async () => {
    const f = fakeDb([]);
    await saveCachedAnswer(f.db, scope, good, deps());
    expect(f.purged).toEqual([NOW.toISOString()]);
  });

  it("does not purge when nothing was saved", async () => {
    const f = fakeDb([hitRow]);
    await saveCachedAnswer(f.db, scope, good, deps());
    expect(f.purged).toEqual([]);
  });

  it("checks for a near-identical cached question first, and then saves nothing", async () => {
    const f = fakeDb([hitRow]);
    expect(await saveCachedAnswer(f.db, scope, good, deps())).toBe(false);
    expect(f.rpc).toHaveBeenCalledWith(
      "match_chat_cache",
      expect.objectContaining({ min_similarity: DUPLICATE_SIMILARITY }),
    );
    expect(f.inserted).toEqual([]);
  });

  it("does not even embed an answer that a rule refuses", async () => {
    const embed = vi.fn(async (_text: string) => [1]);
    const f = fakeDb();
    expect(
      await saveCachedAnswer(
        f.db,
        scope,
        { ...good, origin: "not_found" },
        deps(embed),
      ),
    ).toBe(false);
    expect(embed).not.toHaveBeenCalled();
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("returns false, not an error, when saving fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fakeDb([], { insertError: true });
    await expect(saveCachedAnswer(f.db, scope, good, deps())).resolves.toBe(
      false,
    );
  });
});

describe("normaliseQuestion", () => {
  it("squeezes whitespace and trims", () => {
    expect(normaliseQuestion("  a \n\t b  ")).toBe("a b");
  });
});

describe("cacheScope", () => {
  const chatScope = {
    technology: { id: "t1" } as never,
    guideId: "g1",
    hiddenHashes: [],
  };
  const dbWith = (guide: unknown) =>
    ({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: guide }) }),
        }),
      }),
    }) as never;

  it("is the shared guide's current version", async () => {
    const guide = {
      id: "g1",
      owner_id: null,
      technology_id: "t1",
      current_version_id: "v9",
    };
    expect(await cacheScope(dbWith(guide), chatScope)).toEqual({
      technologyId: "t1",
      guideId: "g1",
      guideVersionId: "v9",
    });
  });

  it("is nothing for a person's edited copy, in either form", async () => {
    expect(
      await cacheScope(dbWith({}), { ...chatScope, alsoGuideId: "shared" }),
    ).toBeNull();
    const copy = {
      id: "g2",
      owner_id: "u1",
      technology_id: "t1",
      current_version_id: "v2",
    };
    expect(await cacheScope(dbWith(copy), chatScope)).toBeNull();
  });

  it("is nothing for a guide with no version, or one that is not found", async () => {
    const empty = {
      id: "g1",
      owner_id: null,
      technology_id: "t1",
      current_version_id: null,
    };
    expect(await cacheScope(dbWith(empty), chatScope)).toBeNull();
    expect(await cacheScope(dbWith(null), chatScope)).toBeNull();
  });
});

describe("purgeExpired", () => {
  it("deletes what expired before now and says how many", async () => {
    const f = fakeDb();
    expect(await purgeExpired(f.db, NOW)).toBe(2);
    expect(f.purged).toEqual([NOW.toISOString()]);
  });

  it("returns 0, not an error, when the database fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = {
      from: () => ({
        delete: () => ({
          lt: async () => ({ count: null, error: new Error("down") }),
        }),
      }),
    } as never;
    expect(await purgeExpired(broken, NOW)).toBe(0);
  });
});
