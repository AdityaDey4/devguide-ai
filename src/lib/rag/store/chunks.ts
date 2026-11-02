import type { ServiceClient } from "../../supabase/service";
import type { TablesInsert } from "../../supabase/database.types";
import { INSERT_BATCH_SIZE, LOOKUP_BATCH_SIZE } from "./config";
import { StoreError } from "./errors";

// The two things the store does with the chunks table: ask what is already there, add what is new.

/** Which of these fingerprints are already stored for this technology? */
export async function findExistingHashes(
  db: ServiceClient,
  technologyId: string,
  hashes: string[],
): Promise<Set<string>> {
  const existing = new Set<string>();

  for (let i = 0; i < hashes.length; i += LOOKUP_BATCH_SIZE) {
    const { data, error } = await db
      .from("chunks")
      .select("content_hash")
      .eq("technology_id", technologyId)
      .in("content_hash", hashes.slice(i, i + LOOKUP_BATCH_SIZE));

    if (error) throw new StoreError("look up existing chunks", error);
    for (const row of data) existing.add(row.content_hash);
  }
  return existing;
}

/**
 * Adds the rows and returns how many were really added. A row whose fingerprint is already
 * stored is silently ignored, so two runs at the same time cannot create duplicates.
 */
export async function insertChunks(
  db: ServiceClient,
  rows: TablesInsert<"chunks">[],
): Promise<number> {
  let inserted = 0;

  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    const { data, error } = await db
      .from("chunks")
      .upsert(rows.slice(i, i + INSERT_BATCH_SIZE), {
        onConflict: "technology_id,content_hash",
        ignoreDuplicates: true,
      })
      .select("id"); // only rows that were really inserted come back

    if (error) throw new StoreError("save chunks", error);
    inserted += data.length;
  }
  return inserted;
}
