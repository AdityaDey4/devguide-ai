import {
  findExisting,
  type Existing,
  type FindOptions,
  type Lookup,
  type SearchDb,
} from "./find";
import { normaliseQuery } from "./normalise";

export { normaliseQuery } from "./normalise";
export type { SearchDb } from "./find";

// Decides what a search means (SRS FR-SRCH-1, FR-SRCH-2, FR-GEN-12, BR-2).
//
//   resolveSearch(db, "  Zod ")  -> { kind: "guide", slug: "zod" }                  open the guide
//   resolveSearch(db, "Hono")    -> { kind: "join", slug: "hono", runId: "…" }      a run is writing it
//   resolveSearch(db, "Bun")     -> { kind: "new", query: "Bun", slug: "bun" }      start a run
//   resolveSearch(db, "x")       -> { kind: "invalid", reason: "too_short" }
//   resolveSearch(db, "Mercury", { retry: true })   a partial draft does not count as a guide:
//                                                  retrying a failed run starts a new one
//
// `slug` of a new search is only the name's own slug; the run decides the real one.

export type Resolution =
  | { kind: "invalid"; reason: "too_short" | "too_long" }
  | { kind: "guide"; slug: string }
  | { kind: "join"; slug: string; runId: string }
  | { kind: "new"; query: string; slug: string };

export type SearchDeps = {
  findExisting: (
    db: SearchDb,
    lookup: Lookup,
    options: FindOptions,
  ) => Promise<Existing | null>;
};

const realDeps: SearchDeps = { findExisting };

export async function resolveSearch(
  db: SearchDb,
  raw: string,
  options: FindOptions = {},
  deps: SearchDeps = realDeps,
): Promise<Resolution> {
  const query = normaliseQuery(raw);
  if (!query.ok) return { kind: "invalid", reason: query.reason };

  const existing = await deps.findExisting(
    db,
    { display: query.display, slugs: query.slugs },
    options,
  );
  if (existing?.kind === "guide") return existing;
  if (existing?.kind === "run") return { ...existing, kind: "join" };
  return { kind: "new", query: query.display, slug: query.slugs[0] };
}
