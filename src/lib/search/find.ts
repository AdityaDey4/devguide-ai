import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";

// The two questions search asks the database. Both run as the signed-in person (RLS applies).

export type SearchDb = SupabaseClient<Database>;

/** The slug of a technology that already has a shared guide with content, or null. */
export async function findGuideSlug(
  db: SearchDb,
  slugs: string[],
): Promise<string | null> {
  const { data: technologies, error } = await db
    .from("technologies")
    .select("id, slug")
    .in("slug", slugs);
  if (error) throw new Error(`Search failed: ${error.message}`);

  for (const technology of technologies ?? []) {
    const { data: guide } = await db
      .from("guides")
      .select("id")
      .eq("technology_id", technology.id)
      .is("owner_id", null)
      .not("current_version_id", "is", null)
      .maybeSingle();
    if (guide) return technology.slug;
  }
  return null;
}
