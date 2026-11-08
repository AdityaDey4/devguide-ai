import type { SearchHit } from "../../../shared/tavily";

// A model can invent a plausible website. A guide must be grounded in real sources (BR-1), so a
// URL from the model is only trusted when its site (origin) appears in the search results.
//
//   isGrounded("https://zod.dev/docs", hits)  -> true   (a result is on https://zod.dev)
//   isGrounded("https://zod-docs.io", hits)   -> false  (never seen in the results)

export function isGrounded(url: string | null, hits: SearchHit[]): boolean {
  const origin = originOf(url);
  return origin !== null && hits.some((hit) => originOf(hit.url) === origin);
}

/**
 * The address of search result number `n` (counting from 1, as the model saw them), without
 * anchor or query, or null when there is no such result or it is not an https page. The model
 * only ever says a number; the address always comes from the results.
 *
 *   resultUrl(2, [{ url: "https://a.dev" }, { url: "https://zod.dev/api#x?y=1" }]) -> "https://zod.dev/api"
 *   resultUrl(9, hits)                                                              -> null
 */
export function resultUrl(n: number | null, hits: SearchHit[]): string | null {
  const hit = n === null ? undefined : hits[n - 1];
  if (!hit || originOf(hit.url) === null) return null;
  const parsed = new URL(hit.url);
  return `${parsed.origin}${parsed.pathname}`;
}

/**
 * The newest version number the search results mention, or null (FR-GEN-2: "if found"). Only
 * explicit forms count: "v4.1.0", "version 15.2", "@1.2.3". It is read with a pattern, not by the
 * model: asked for a version, the small model sometimes never finished writing it.
 *
 *   findVersion([{ content: "Zod 4 is stable. v4.1.0" }, { content: "upgrade from v3.22" }]) -> "4.1.0"
 *   findVersion([{ content: "built in 2024" }])                                               -> null
 */
const VERSION = /(?:\bv|\bversion\s+|@)(\d+\.\d+(?:\.\d+)?)(?![\w.]*\d)/gi;

export function findVersion(hits: SearchHit[]): string | null {
  const found = hits.flatMap((hit) =>
    [...`${hit.title} ${hit.content}`.matchAll(VERSION)].map((m) => m[1]),
  );
  if (found.length === 0) return null;
  const parts = (version: string) => version.split(".").map(Number);
  return found.reduce((best, next) => {
    const [a, b] = [parts(best), parts(next)];
    for (let i = 0; i < 3; i++) {
      if ((b[i] ?? 0) !== (a[i] ?? 0))
        return (b[i] ?? 0) > (a[i] ?? 0) ? next : best;
    }
    return best;
  });
}

/** The https origin of a URL, or null for anything else (http, junk, empty). */
export function originOf(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

/**
 * Brings a docs address back to the page that starts the documentation: the model sometimes
 * answers with a deep page, and discovery (llms.txt, sitemap, crawl) finds nothing from there.
 * Anchors, queries and file endings go; a path is kept only up to its first segment, and only
 * when that segment is a docs folder.
 *
 *   docsStartPage("https://hono.dev/docs/overview.html#intro")  -> "https://hono.dev/docs"
 *   docsStartPage("https://zod.dev/api/strings")                -> "https://zod.dev"
 *   docsStartPage("https://zod.dev")                            -> "https://zod.dev"
 */
const DOCS_FOLDERS = new Set([
  "docs",
  "doc",
  "documentation",
  "guide",
  "guides",
]);

export function docsStartPage(url: string): string {
  const parsed = new URL(url);
  const first = parsed.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  return DOCS_FOLDERS.has(first ?? "")
    ? `${parsed.origin}/${first}`
    : parsed.origin;
}

/**
 * Where the documentation starts, worked out from the search results instead of the model: the
 * first result on the official site that sits in a docs folder gives that folder, otherwise the
 * site root.
 *
 *   findDocsStart("https://hono.dev", [{ url: "https://hono.dev/docs/overview.html" }]) -> "https://hono.dev/docs"
 *   findDocsStart("https://zod.dev/", [{ url: "https://zod.dev/api" }])                 -> "https://zod.dev"
 */
export function findDocsStart(officialUrl: string, hits: SearchHit[]): string {
  const origin = originOf(officialUrl);
  const inDocs = hits
    .filter((hit) => originOf(hit.url) === origin)
    .map((hit) => docsStartPage(hit.url))
    .find((start) => start !== origin);
  return inDocs ?? origin ?? officialUrl;
}
