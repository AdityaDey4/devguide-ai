import { fetchPage } from "../fetchPage";
import { MAX_PAGES, MIN_USEFUL_PAGES } from "./config";
import { fromCrawl } from "./fromCrawl";
import { fromLlmsTxt } from "./fromLlmsTxt";
import { fromSitemap } from "./fromSitemap";
import { createScope } from "./scope";
import type {
  DiscoverDeps,
  DiscoveryAttempt,
  DiscoveryResult,
  DiscoverOptions,
} from "./types";

export type {
  DiscoveredPage,
  DiscoveryResult,
  DiscoverOptions,
  DiscoverySource,
} from "./types";

// Finds the documentation pages of a site (SRS FR-GEN-3, FR-ING-1).
//
//   const result = await discoverDocs("https://zod.dev");
//   result.pages  -> [{ url: "https://zod.dev/api", title: "Defining schemas" }, ...]
//   result.source -> "llms.txt"
//
// Three sources, tried in this order; the first one that finds enough pages wins:
//   1. llms.txt    fromLlmsTxt.ts   (needs at least 5 pages)
//   2. sitemap.xml fromSitemap.ts   (needs at least 5 pages)
//   3. link crawl  fromCrawl.ts     (any pages at all: tiny docs are fine)
//
// Which URLs count as "docs" (same site, under the docs path, no images...) is decided
// in scope.ts. Node only: do not import this from client code.

export function createDiscoverDocs(deps: DiscoverDeps) {
  return async function discoverDocs(
    docsUrl: string,
    options: DiscoverOptions = {},
  ): Promise<DiscoveryResult> {
    const scope = createScope(docsUrl); // throws if the URL is not https
    const maxPages = options.maxPages ?? MAX_PAGES;
    const attempts: DiscoveryAttempt[] = [];

    const sources = [
      { source: "llms.txt", minPages: MIN_USEFUL_PAGES, run: fromLlmsTxt },
      { source: "sitemap", minPages: MIN_USEFUL_PAGES, run: fromSitemap },
      { source: "crawl", minPages: 1, run: fromCrawl },
    ] as const;

    for (const { source, minPages, run } of sources) {
      const { pages, note } = await run(scope, deps, options.signal);
      attempts.push({ source, pages: pages.length, note });

      if (pages.length >= minPages) {
        return {
          source,
          pages: pages.slice(0, maxPages),
          truncated: pages.length > maxPages,
          attempts,
        };
      }
    }

    // Nothing found. `attempts` says why, so the caller can show a useful message.
    return { source: null, pages: [], truncated: false, attempts };
  };
}

/** The guarded discovery: every request goes through the SSRF-checked fetchPage. */
export const discoverDocs = createDiscoverDocs({ fetchPage });
