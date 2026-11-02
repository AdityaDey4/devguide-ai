import { createServiceClient } from "../../supabase/service";
import { embedTexts } from "../embedder";
import { MAX_CANDIDATES } from "./config";
import { mergeCandidates } from "./merge";
import { searchOne } from "./search";
import type { Candidate, RetrieveDeps, RetrieveInput } from "./types";
import { cleanVariants } from "./variants";

export { RetrieveError } from "./errors";
export type { Candidate, RetrieveInput } from "./types";

// Finds the chunks that may answer a question (SRS FR-CHAT-3).
//
//   const candidates = await retrieve({
//     technologyId,
//     queries: ["How do I validate an email?", "z.email schema"],
//   });
//   candidates[0] -> { content: "...", sourceUrl: "https://zod.dev/api", score: 0.033, ... }
//
// Up to 40 candidates, best first. The reranker (next task) picks the final 5 from them.
// Read this file first: it is the whole recipe. Server only: it uses the service-role key.

const realDeps: RetrieveDeps = {
  db: createServiceClient,
  embed: (texts) => embedTexts(texts),
};

export async function retrieve(
  input: RetrieveInput,
  deps: RetrieveDeps = realDeps,
): Promise<Candidate[]> {
  const queries = cleanVariants(input.queries); // 1. drop blanks and repeats, keep 3
  if (queries.length === 0) return [];

  const { embeddings } = await deps.embed(queries); // 2. one embedding call for all variants
  const db = deps.db();

  // 3. one hybrid search per variant, all at once
  const searches = queries.map((text, i) =>
    searchOne(db, {
      text,
      vector: embeddings[i],
      technologyId: input.technologyId,
      guideId: input.guideId,
    }),
  );
  const lists = await Promise.all(searches);

  // 4. merge by chunk id keeping the best score, then keep the top 40
  return mergeCandidates(lists).slice(0, MAX_CANDIDATES);
}
