import type { DiscoveredPage, DiscoveryResult } from "../fetch/discover";
import type { FetchedPage, FetchPageOptions } from "../fetch/fetchPage";
import type { ServiceClient } from "../supabase/service";
import type { StoreInput, StoreResult, TechnologyInput } from "../rag/store";

/** What happened to one page. */
export type PageOutcome = {
  url: string;
  title: string;
  /** stored = read and saved (possibly all repeats); too_short = a stub page; failed = see reason. */
  status: "stored" | "too_short" | "failed";
  chunks: number;
  inserted: number;
  skipped: number;
  tokens: number;
  reason?: string;
};

export type IngestOptions = {
  /** Display name. Default: made from the address. */
  name?: string;
  /** Short id used in URLs and the database, e.g. "zod". Default: made from the address. */
  slug?: string;
  /** Most pages to read. Default 40 (the run budget in SRS FR-GEN-11). */
  maxPages?: number;
  signal?: AbortSignal;
  /** Called as each page finishes, so a command line can show progress. */
  onPage?: (
    outcome: PageOutcome,
    progress: { done: number; total: number },
  ) => void;
};

export type IngestResult = {
  /** `id` is null when no pages were found, because nothing was written to the database. */
  technology: { id: string | null; name: string; slug: string };
  discovery: {
    source: DiscoveryResult["source"];
    /** Pages the source listed. */
    found: number;
    /** True if `found` is bigger than the number of pages we read. */
    cutByMaxPages: boolean;
    attempts: DiscoveryResult["attempts"];
  };
  outcomes: PageOutcome[];
  totals: {
    pages: number;
    stored: number;
    tooShort: number;
    failed: number;
    chunks: number;
    inserted: number;
    skipped: number;
    tokens: number;
  };
};

/** What the belt needs from the outside. Tests pass fakes here. */
export type IngestDeps = {
  db: () => ServiceClient;
  upsertTechnology: (
    db: ServiceClient,
    input: TechnologyInput,
  ) => Promise<string>;
  discoverDocs: (
    docsUrl: string,
    options?: { signal?: AbortSignal },
  ) => Promise<DiscoveryResult>;
  fetchPage: (url: string, options?: FetchPageOptions) => Promise<FetchedPage>;
  storeChunks: (input: StoreInput) => Promise<StoreResult>;
};

export type { DiscoveredPage };
