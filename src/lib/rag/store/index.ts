import { createServiceClient } from "../../supabase/service";
import type { TablesInsert } from "../../supabase/database.types";
import type { Chunk } from "../chunker";
import { embedTexts } from "../embedder";
import { findExistingHashes, insertChunks } from "./chunks";
import { expiresAt } from "./expiry";
import { contentHash } from "./hash";
import { upsertSource } from "./sources";
import type { StoreDeps, StoreInput, StoreResult } from "./types";

export { contentHash } from "./hash";
export { StoreError } from "./errors";
export { upsertTechnology } from "./technologies";
export type {
  SourceType,
  StoreInput,
  StoreResult,
  TechnologyInput,
} from "./types";

// Saves the chunks of one page into the database (SRS FR-KB-3 to FR-KB-6).
//
//   const result = await storeChunks({ technologyId, source: { url, title, type: "official" }, chunks });
//   result -> { sourceId: "...", total: 15, inserted: 12, skipped: 3, tokens: 4100 }
//
// Run it again with the same page: { inserted: 0, skipped: 15, tokens: 0 } and no embedding cost.
// Read this file first: it is the whole recipe. Server only: it uses the service-role key.

const realDeps: StoreDeps = {
  db: createServiceClient,
  embed: (texts) => embedTexts(texts),
  now: () => new Date(),
};

export async function storeChunks(
  input: StoreInput,
  deps: StoreDeps = realDeps,
): Promise<StoreResult> {
  const { technologyId, source, chunks } = input;
  const db = deps.db();
  const fetchedAt = deps.now();

  // 1. Fingerprint every chunk. The same text twice on one page counts once.
  const unique = uniqueByHash(chunks);

  // 2. Which of them are already stored for this technology?
  const existing = await findExistingHashes(
    db,
    technologyId,
    unique.map((chunk) => chunk.hash),
  );
  const fresh = unique.filter((chunk) => !existing.has(chunk.hash));

  // 3. Embed ONLY the new ones. This is where skipping saves money.
  const embedded =
    fresh.length > 0
      ? await deps.embed(fresh.map((chunk) => chunk.content))
      : { embeddings: [], tokens: 0 };

  // 4. Record the page (after embedding, so a failed embedding leaves nothing behind).
  const sourceId = input.guideId
    ? null // chunks of our own guide: there is no fetched page to record
    : await upsertSource(db, {
        technologyId,
        url: source.url,
        title: source.title,
        type: source.type,
        contentHash:
          source.contentHash ??
          contentHash(chunks.map((chunk) => chunk.content).join("\n\n")),
        fetchedAt,
      });

  // 5. Save the new chunks, with their vectors and expiry.
  const rows: TablesInsert<"chunks">[] = fresh.map((chunk, i) => ({
    technology_id: technologyId,
    source_id: sourceId,
    guide_id: input.guideId ?? null,
    source_type: source.type,
    content: chunk.content,
    heading_path: chunk.headingPath,
    tech_version: input.techVersion ?? null,
    content_hash: chunk.hash,
    embedding: JSON.stringify(embedded.embeddings[i]), // pgvector reads "[0.1,0.2,...]"
    fetched_at: fetchedAt.toISOString(),
    expires_at: expiresAt(source.type, fetchedAt),
  }));
  const inserted = await insertChunks(db, rows);

  return {
    sourceId,
    total: chunks.length,
    inserted,
    skipped: chunks.length - inserted,
    tokens: embedded.tokens,
  };
}

function uniqueByHash(chunks: Chunk[]): (Chunk & { hash: string })[] {
  const byHash = new Map<string, Chunk & { hash: string }>();
  for (const chunk of chunks) {
    const hash = contentHash(chunk.content);
    if (!byHash.has(hash)) byHash.set(hash, { ...chunk, hash });
  }
  return Array.from(byHash.values());
}
