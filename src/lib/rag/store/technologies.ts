import type { ServiceClient } from "../../supabase/service";
import { StoreError } from "./errors";
import type { TechnologyInput } from "./types";

/**
 * Makes sure the technology exists and returns its id. Safe to call again and again: the slug
 * identifies it, and only the fields you pass are updated (aliases are never overwritten).
 *
 *   upsertTechnology(db, { name: "Zod", slug: "zod", docsUrl: "https://zod.dev" })  ->  "3f2a..."
 */
export async function upsertTechnology(
  db: ServiceClient,
  input: TechnologyInput,
): Promise<string> {
  const row = {
    name: input.name,
    slug: input.slug,
    ...(input.officialUrl !== undefined && { official_url: input.officialUrl }),
    ...(input.docsUrl !== undefined && { docs_url: input.docsUrl }),
    ...(input.latestVersion !== undefined && {
      latest_version: input.latestVersion,
    }),
  };

  const { data, error } = await db
    .from("technologies")
    .upsert(row, { onConflict: "slug" })
    .select("id")
    .single();

  if (error) throw new StoreError(`save the technology "${input.slug}"`, error);
  return data.id;
}
