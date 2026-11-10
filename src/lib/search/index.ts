import { findGuideSlug, type SearchDb } from "./find";
import { normaliseQuery } from "./normalise";

export { normaliseQuery } from "./normalise";
export type { SearchDb } from "./find";

// Decides what a search means (SRS FR-SRCH-1, FR-SRCH-2, BR-2).
//
//   resolveSearch(db, "  Zod ")        -> { kind: "guide", slug: "zod" }       a guide exists: open it
//   resolveSearch(db, "Hono")          -> { kind: "new", query: "Hono", slug: "hono" }   start a run
//   resolveSearch(db, "x")             -> { kind: "invalid", reason: "too_short" }
//
// `slug` of a new search is only the name's own slug; the run decides the real one.

export type Resolution =
  | { kind: "invalid"; reason: "too_short" | "too_long" }
  | { kind: "guide"; slug: string }
  | { kind: "new"; query: string; slug: string };

export type SearchDeps = {
  findGuideSlug: (db: SearchDb, slugs: string[]) => Promise<string | null>;
};

const realDeps: SearchDeps = { findGuideSlug };

export async function resolveSearch(
  db: SearchDb,
  raw: string,
  deps: SearchDeps = realDeps,
): Promise<Resolution> {
  const query = normaliseQuery(raw);
  if (!query.ok) return { kind: "invalid", reason: query.reason };

  const existing = await deps.findGuideSlug(db, query.slugs);
  if (existing) return { kind: "guide", slug: existing };
  return { kind: "new", query: query.display, slug: query.slugs[0] };
}
