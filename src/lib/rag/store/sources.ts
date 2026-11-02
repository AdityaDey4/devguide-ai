import type { ServiceClient } from "../../supabase/service";
import { StoreError } from "./errors";
import type { SourceType } from "./types";

/**
 * Records that we read this page, and returns the row id. One row per (technology, url):
 * seeing the page again updates its title, fingerprint and fetch time instead of adding a row.
 */
export async function upsertSource(
  db: ServiceClient,
  input: {
    technologyId: string;
    url: string;
    title: string;
    type: SourceType;
    contentHash: string;
    fetchedAt: Date;
  },
): Promise<string> {
  const { data, error } = await db
    .from("sources")
    .upsert(
      {
        technology_id: input.technologyId,
        url: input.url,
        title: input.title,
        source_type: input.type,
        content_hash: input.contentHash,
        fetched_at: input.fetchedAt.toISOString(),
      },
      { onConflict: "technology_id,url" },
    )
    .select("id")
    .single();

  if (error) throw new StoreError(`save the source ${input.url}`, error);
  return data.id;
}
