import type { ServiceClient } from "../../supabase/service";
import type { Chunk } from "../chunker";
import type { EmbedResult } from "../embedder";

/** Where a piece of knowledge came from (the `source_type` column). */
export type SourceType = "official" | "context7" | "guide";

export type StoreInput = {
  technologyId: string;
  /** The page the chunks were cut from. */
  source: {
    url: string;
    title: string;
    type: SourceType;
    /** Fingerprint of the whole page (see contentHash). Used later to detect that a page changed. */
    contentHash?: string;
  };
  /** Straight from the chunker. */
  chunks: Chunk[];
  /** The technology version the text describes, if known (e.g. "4.1"). */
  techVersion?: string;
  /**
   * Set when the chunks are the text of one of OUR guides (source.type "guide"). They are then
   * tied to that guide and no `sources` row is made, because a guide is not a fetched page.
   */
  guideId?: string;
};

export type StoreResult = {
  /** The row in `sources` for this page, or null for the chunks of one of our own guides. */
  sourceId: string | null;
  /** Chunks given. */
  total: number;
  /** Chunks that were new and are now saved. */
  inserted: number;
  /** Chunks left out because the same text was already stored (not embedded, not paid for). */
  skipped: number;
  /** Tokens sent to the embedding model for the new chunks. */
  tokens: number;
};

/** What the store needs from the outside. Tests pass a fake embedder here. */
export type StoreDeps = {
  db: () => ServiceClient;
  embed: (texts: string[]) => Promise<EmbedResult>;
  now: () => Date;
};

export type TechnologyInput = {
  name: string;
  slug: string;
  officialUrl?: string;
  docsUrl?: string;
  latestVersion?: string;
};
