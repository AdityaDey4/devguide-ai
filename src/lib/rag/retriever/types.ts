import type { ServiceClient } from "../../supabase/service";
import type { EmbedResult } from "../embedder";
import type { SourceType } from "../store";

/** What to look for. */
export type RetrieveInput = {
  /** The technology to search in. Retrieval never crosses technologies (FR-CHAT-1). */
  technologyId: string;
  /** The question and its rewrites ("variants"), best first. At most 3 are used. */
  queries: string[];
  /** Include this guide's own chunks too (other guides' chunks are never returned). */
  guideId?: string;
};

/** One chunk that may help answer the question. */
export type Candidate = {
  id: string;
  content: string;
  headingPath: string | null;
  sourceType: SourceType;
  sourceId: string | null;
  /** The page it came from, for citations. Null for chunks of our own guides. */
  sourceUrl: string | null;
  sourceTitle: string | null;
  /** RRF score from hybrid_search: higher is better, only comparable between candidates. */
  score: number;
};

/** What the retriever needs from the outside. Tests pass fakes here. */
export type RetrieveDeps = {
  db: () => ServiceClient;
  embed: (texts: string[]) => Promise<EmbedResult>;
};
