import type { safeLookup } from "../ssrfGuard";

export type FetchPageOptions = {
  /** Per attempt, covering all redirect hops. Default 10 s. */
  timeoutMs?: number;
  /** Decompressed body limit. Default 2 MB. */
  maxBytes?: number;
  /** Default 3. */
  maxRedirects?: number;
  /** Extra attempts after the first for transient failures. Default 1. */
  retries?: number;
  /** Cancels the fetch (used by run budgets). */
  signal?: AbortSignal;
};

/** FetchPageOptions with the defaults filled in. */
export type ResolvedOptions = Required<Omit<FetchPageOptions, "signal">> & {
  signal?: AbortSignal;
};

export type FetchedPage = {
  requestedUrl: string;
  /** URL after redirects. */
  url: string;
  status: number;
  /** Lower-cased media type without parameters, e.g. "text/html". */
  contentType: string;
  body: string;
  bytes: number;
  /** URLs passed through before the final one. */
  redirects: string[];
  fetchedAt: Date;
};

/** What the fetcher needs from the outside. Tests swap these; production never does. */
export type FetchDeps = {
  assertSafeUrl: (url: string | URL) => Promise<{ url: URL }>;
  lookup: typeof safeLookup;
};
