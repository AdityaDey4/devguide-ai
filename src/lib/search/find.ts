import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";

// The question search asks the database. It runs as the signed-in person (RLS applies).

export type SearchDb = SupabaseClient<Database>;

/** Options for the lookup. `retry`: a partial draft is not a guide to open, it is what failed. */
export type FindOptions = { retry?: boolean };

/** What the person typed: the cleaned name, and the slugs it may be saved under. */
export type Lookup = { display: string; slugs: string[] };

/** What already exists for that name. */
export type Existing =
  | { kind: "guide"; slug: string } // a shared guide with content: open it
  | { kind: "run"; slug: string; runId: string }; // no guide yet, but a run is writing it

/**
 * Looks for the technology by slug ("nextjs") or by name, whatever the case ("Apache Kafka"),
 * and says what exists for it: a guide first, else the run that is writing one, else null.
 *
 *   findExisting(db, { display: "Zod", slugs: ["zod"] })  -> { kind: "guide", slug: "zod" }
 *   findExisting(db, { display: "Hono", slugs: ["hono"] }) -> { kind: "run", slug: "hono", runId: "…" }
 */
export async function findExisting(
  db: SearchDb,
  { display, slugs }: Lookup,
  { retry = false }: FindOptions = {},
): Promise<Existing | null> {
  const bySlug = await db
    .from("technologies")
    .select("id, slug")
    .in("slug", slugs);
  const byName = await db
    .from("technologies")
    .select("id, slug")
    .ilike("name", escapeLike(display)); // no wildcards in it: equal, ignoring case
  const failed = bySlug.error ?? byName.error;
  if (failed) throw new Error(`Search failed: ${failed.message}`);
  const technologies = [...(bySlug.data ?? []), ...(byName.data ?? [])];

  for (const technology of technologies) {
    const { data: guide } = await db
      .from("guides")
      .select("id, status")
      .eq("technology_id", technology.id)
      .is("owner_id", null)
      .not("current_version_id", "is", null)
      .maybeSingle();
    if (guide && !(retry && guide.status === "partial")) {
      return { kind: "guide", slug: technology.slug };
    }
  }

  for (const technology of technologies) {
    // At most one: the unique index "one active generate run per technology" sees to that.
    const { data: run } = await db
      .from("runs")
      .select("id")
      .eq("technology_id", technology.id)
      .eq("type", "generate")
      .in("status", ["queued", "running", "waiting_user"])
      .maybeSingle();
    if (run) return { kind: "run", slug: technology.slug, runId: run.id };
  }
  return null;
}

/** In LIKE, % and _ are wildcards: typed text must mean exactly itself. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}
