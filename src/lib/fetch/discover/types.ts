import type { FetchedPage, FetchPageOptions } from "../fetchPage";

/** One documentation page found on a site. */
export type DiscoveredPage = {
  url: string;
  title: string;
};

/** Where the list came from. */
export type DiscoverySource = "llms.txt" | "sitemap" | "crawl";

/** What one source found (kept so a failed discovery can be explained). */
export type DiscoveryAttempt = {
  source: DiscoverySource;
  pages: number;
  /** Why it found nothing, or anything worth knowing. */
  note?: string;
};

export type DiscoveryResult = {
  /** The source that was used, or null if none found anything. */
  source: DiscoverySource | null;
  pages: DiscoveredPage[];
  /** True if there were more pages than `maxPages` and the list was cut. */
  truncated: boolean;
  attempts: DiscoveryAttempt[];
};

export type DiscoverOptions = {
  /** Cap on the returned list. Default 500. */
  maxPages?: number;
  signal?: AbortSignal;
};

/** What a source returns. */
export type SourceOutcome = {
  pages: DiscoveredPage[];
  note?: string;
};

export type FetchPageFn = (
  url: string,
  options?: FetchPageOptions,
) => Promise<FetchedPage>;

/** What discovery needs from the outside. Tests pass a fake site here. */
export type DiscoverDeps = {
  fetchPage: FetchPageFn;
};
