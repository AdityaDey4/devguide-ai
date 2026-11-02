import type { ServiceClient } from "../../supabase/service";
import { MATCH_COUNT } from "./config";
import { RetrieveError } from "./errors";
import type { Candidate, SearchMode } from "./types";

// ONE search: a question and its vector go to the hybrid_search SQL function, which returns
// the best chunks by meaning and by words (see supabase/migrations/*_hybrid_search.sql).

export async function searchOne(
  db: ServiceClient,
  search: {
    text: string;
    vector: number[];
    technologyId: string;
    guideId?: string;
    mode?: SearchMode;
  },
): Promise<Candidate[]> {
  const { data, error } = await db.rpc("hybrid_search", {
    query_text: search.text,
    query_embedding: JSON.stringify(search.vector), // pgvector reads "[0.1,0.2,...]"
    tech_id: search.technologyId,
    p_guide_id: search.guideId,
    match_count: MATCH_COUNT,
    search_mode: search.mode,
  });
  if (error) throw new RetrieveError(error);

  return data.map((row) => ({
    id: row.id,
    content: row.content,
    headingPath: row.heading_path,
    sourceType: row.source_type as Candidate["sourceType"],
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    sourceTitle: row.source_title,
    score: row.score,
  }));
}
