import type { ServiceClient } from "../../supabase/service";
import { StoreError } from "../store/errors";

/**
 * Deletes the chunks of this guide whose text is no longer part of it (a new version changed or
 * dropped that passage). `keep` are the fingerprints of the chunks that are still current.
 * Returns how many were removed.
 */
export async function removeStaleGuideChunks(
  db: ServiceClient,
  guideId: string,
  keep: string[],
): Promise<number> {
  let query = db
    .from("chunks")
    .delete()
    .eq("guide_id", guideId)
    .eq("source_type", "guide");
  // fingerprints are hex, so they are safe inside the list
  if (keep.length > 0)
    query = query.not("content_hash", "in", `(${keep.join(",")})`);

  const { data, error } = await query.select("id");
  if (error) throw new StoreError("remove old guide chunks", error);
  return data.length;
}
