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
