import { describe, expect, it, vi } from "vitest";
import { resolveSearch, type SearchDb } from "@/lib/search";
import { normaliseQuery } from "@/lib/search/normalise";

describe("normaliseQuery (FR-SRCH-1)", () => {
  it("trims and collapses spaces but keeps the typed case to search the web with", () => {
    expect(normaliseQuery("   Next   JS  ")).toMatchObject({
      ok: true,
      display: "Next JS",
    });
  });

  it("accepts 2 to 60 characters after trimming, and no others", () => {
    expect(normaliseQuery("a")).toEqual({ ok: false, reason: "too_short" });
    expect(normaliseQuery("ab")).toMatchObject({ ok: true });
    expect(normaliseQuery("x".repeat(60))).toMatchObject({ ok: true });
    expect(normaliseQuery("x".repeat(61))).toEqual({
      ok: false,
      reason: "too_long",
    });
    expect(normaliseQuery(`  ${"x".repeat(60)}  `)).toMatchObject({ ok: true });
    expect(normaliseQuery(" \n\t ")).toEqual({
      ok: false,
      reason: "too_short",
    });
  });

  it("keeps the characters real technology names use", () => {
    for (const name of ["C#", "C++", "Node.js", ".NET", "Vue_2", "Zürich DB"]) {
      expect(normaliseQuery(name)).toMatchObject({ ok: true, display: name });
    }
  });

  it("drops characters that could break a query or a prompt", () => {
    const result = normaliseQuery('zod"}); drop table{x},(y)\\');
    expect(result.ok && result.display).not.toMatch(/["{}(),;\\]/);
    expect(normaliseQuery("!!!")).toEqual({ ok: false, reason: "too_short" });
  });

  it("gives the slugs a technology may be saved under: nextjs and next-js", () => {
    for (const typed of ["Next.js", "next js", "NEXT-JS", "next_js"]) {
      const result = normaliseQuery(typed);
      expect(result.ok && result.slugs).toEqual(["nextjs", "next-js"]);
    }
    expect(normaliseQuery("Zod")).toMatchObject({ slugs: ["zod"] });
  });
});

describe("resolveSearch", () => {
  const db = {} as SearchDb;

  it("says invalid, and asks the database nothing, for text outside 2 to 60 characters", async () => {
    const findGuideSlug = vi.fn();
    expect(await resolveSearch(db, "x", { findGuideSlug })).toEqual({
      kind: "invalid",
      reason: "too_short",
    });
    expect(findGuideSlug).not.toHaveBeenCalled();
  });

  it("opens an existing guide, found under any spelling (FR-SRCH-2)", async () => {
    const findGuideSlug = vi.fn(async () => "nextjs");
    expect(await resolveSearch(db, "Next JS", { findGuideSlug })).toEqual({
      kind: "guide",
      slug: "nextjs",
    });
    expect(findGuideSlug).toHaveBeenCalledWith(db, ["nextjs", "next-js"]);
  });

  it("starts a new run, with the typed name, when there is no guide", async () => {
    const findGuideSlug = vi.fn(async () => null);
    expect(
      await resolveSearch(db, "  Some   New Thing ", { findGuideSlug }),
    ).toEqual({ kind: "new", query: "Some New Thing", slug: "somenewthing" });
  });
});
