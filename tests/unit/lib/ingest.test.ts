import { describe, expect, it, vi } from "vitest";
import { createIngest, technologyFor, type PageOutcome } from "@/lib/ingest";
import type { IngestDeps } from "@/lib/ingest/types";
import type { StoreInput } from "@/lib/rag/store";
import type { ServiceClient } from "@/lib/supabase/service";
import { fakeSite, htmlPage, type Reply } from "../../helpers/fakeSite";
import { paragraph } from "../../helpers/markdown";

const ROOT = "https://docs.example.com";

const article = (title: string): Reply => ({
  type: "text/html",
  body: `<html><head><title>${title} | Example</title></head><body><main><h1>${title}</h1><p>${paragraph(150, title)}</p></main></body></html>`,
});

/** An ingest with a fake site, a fake database and a fake store that remembers what it saw. */
function setup(files: Record<string, Reply>, urls: string[]) {
  const site = fakeSite(files);
  const seen = new Set<string>();
  const stored: string[] = [];

  const deps: IngestDeps = {
    db: () => ({}) as ServiceClient,
    upsertTechnology: vi.fn(async () => "tech-1"),
    discoverDocs: vi.fn(async () => ({
      source: "llms.txt" as const,
      pages: urls.map((url) => ({ url, title: url })),
      truncated: false,
      attempts: [],
    })),
    fetchPage: site.fetchPage,
    // Same rule as the real store: text already seen is skipped.
    storeChunks: vi.fn(async ({ source, chunks }: StoreInput) => {
      stored.push(source.url);
      const fresh = chunks.filter((c) => !seen.has(c.content));
      fresh.forEach((c) => seen.add(c.content));
      return {
        sourceId: "s",
        total: chunks.length,
        inserted: fresh.length,
        skipped: chunks.length - fresh.length,
        tokens: fresh.length * 10,
      };
    }),
  };
  return { ingestSite: createIngest(deps), deps, site, stored };
}

describe("ingestSite", () => {
  it("fetches, cleans, chunks and stores every page, and adds up the totals", async () => {
    const urls = [`${ROOT}/a`, `${ROOT}/b`];
    const { ingestSite, deps } = setup(
      { [urls[0]]: article("Alpha"), [urls[1]]: article("Bravo") },
      urls,
    );
    const result = await ingestSite(ROOT);

    expect(result.technology).toEqual({
      id: "tech-1",
      name: expect.any(String),
      slug: expect.any(String),
    });
    expect(result.totals).toMatchObject({
      pages: 2,
      stored: 2,
      failed: 0,
      tooShort: 0,
    });
    expect(result.totals.inserted).toBe(result.totals.chunks);
    expect(deps.storeChunks).toHaveBeenCalledTimes(2);
  });

  it("running again inserts nothing and uses no tokens", async () => {
    const urls = [`${ROOT}/a`];
    const { ingestSite } = setup({ [urls[0]]: article("Alpha") }, urls);
    await ingestSite(ROOT);
    const again = await ingestSite(ROOT);
    expect(again.totals.inserted).toBe(0);
    expect(again.totals.tokens).toBe(0);
    expect(again.totals.skipped).toBe(again.totals.chunks);
  });

  it("marks a stub page too_short and does not store it", async () => {
    const urls = [`${ROOT}/stub`];
    const { ingestSite, deps } = setup({ [urls[0]]: htmlPage("Stub") }, urls);
    const result = await ingestSite(ROOT);
    expect(result.outcomes[0].status).toBe("too_short");
    expect(deps.storeChunks).not.toHaveBeenCalled();
  });

  it("turns a failing page into a 'failed' outcome with the reason, and carries on with the rest", async () => {
    const urls = [`${ROOT}/gone`, `${ROOT}/ok`];
    const { ingestSite } = setup({ [urls[1]]: article("Fine") }, urls);
    const result = await ingestSite(ROOT);
    const gone = result.outcomes.find((o) => o.url === urls[0]);
    expect(gone).toMatchObject({ status: "failed", reason: "HTTP 404" });
    expect(result.totals).toMatchObject({ stored: 1, failed: 1 });
  });

  it("also survives the store throwing", async () => {
    const urls = [`${ROOT}/a`];
    const { ingestSite, deps } = setup({ [urls[0]]: article("Alpha") }, urls);
    vi.mocked(deps.storeChunks).mockRejectedValue(new Error("database down"));
    const result = await ingestSite(ROOT);
    expect(result.outcomes[0]).toMatchObject({
      status: "failed",
      reason: "database down",
    });
  });

  it("writes nothing when the site has no pages", async () => {
    const { ingestSite, deps } = setup({}, []);
    const result = await ingestSite(ROOT);
    expect(result.technology.id).toBeNull();
    expect(result.outcomes).toEqual([]);
    expect(deps.upsertTechnology).not.toHaveBeenCalled();
  });

  it("reads at most maxPages pages and says it cut the list", async () => {
    const urls = Array.from({ length: 6 }, (_, i) => `${ROOT}/p${i}`);
    const files = Object.fromEntries(
      urls.map((u, i) => [u, article(`Page${i}`)]),
    );
    const { ingestSite, site } = setup(files, urls);
    const result = await ingestSite(ROOT, { maxPages: 3 });
    expect(site.calls).toHaveLength(3);
    expect(result.discovery).toMatchObject({ found: 6, cutByMaxPages: true });
  });

  it("reads at most 4 pages at the same time", async () => {
    const urls = Array.from({ length: 12 }, (_, i) => `${ROOT}/p${i}`);
    const files = Object.fromEntries(
      urls.map((u, i) => [u, article(`Page${i}`)]),
    );
    const { ingestSite, site } = setup(files, urls);
    await ingestSite(ROOT);
    expect(site.peak).toBeLessThanOrEqual(4);
    expect(site.peak).toBeGreaterThan(1);
  });

  it("reports progress as each page finishes", async () => {
    const urls = [`${ROOT}/a`, `${ROOT}/b`, `${ROOT}/c`];
    const files = Object.fromEntries(
      urls.map((u, i) => [u, article(`Page${i}`)]),
    );
    const { ingestSite } = setup(files, urls);
    const progress: Array<{
      outcome: PageOutcome;
      done: number;
      total: number;
    }> = [];
    await ingestSite(ROOT, {
      onPage: (outcome, p) => progress.push({ outcome, ...p }),
    });
    expect(progress.map((p) => p.done).sort()).toEqual([1, 2, 3]);
    expect(progress.every((p) => p.total === 3)).toBe(true);
  });
});

describe("technologyFor", () => {
  it("makes a name and slug from the address", () => {
    expect(technologyFor("https://zod.dev", {})).toMatchObject({ slug: "zod" });
    expect(technologyFor("https://docs.stripe.com/api", {}).slug).toBe(
      "stripe",
    );
  });

  it("uses the host when it has a single label", () => {
    expect(technologyFor("https://localhost", {}).slug).toBe("localhost");
  });

  it("prefers the name and slug the caller gives", () => {
    expect(
      technologyFor("https://zod.dev", { name: "Zod 4", slug: "zod4" }),
    ).toEqual({ name: "Zod 4", slug: "zod4" });
  });
});
