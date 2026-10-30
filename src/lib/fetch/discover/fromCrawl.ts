import { createLimiter } from "../limiter";
import { CONCURRENCY, CRAWL_MAX_DEPTH, CRAWL_MAX_PAGES } from "./config";
import { readLinks } from "./readLinks";
import type { Scope } from "./scope";
import type { DiscoveredPage, DiscoverDeps, SourceOutcome } from "./types";

// SOURCE 3 (last resort): follow the links, starting from the docs page itself.
//
//   depth 0: the start page            -> its links
//   depth 1: each of those pages       -> their links
//   depth 2: each of those pages       -> listed, but their links are not followed
//   stops at 100 pages; fetches 4 pages at a time.
//
// Slow (one request per page) and incomplete, so it only runs when llms.txt and sitemap.xml
// gave nothing useful.

export async function fromCrawl(
  scope: Scope,
  deps: DiscoverDeps,
  signal?: AbortSignal,
): Promise<SourceOutcome> {
  const start = scope.accept(scope.base.href);
  if (!start)
    return { pages: [], note: "the docs URL is outside its own scope" };

  const limit = createLimiter(CONCURRENCY);
  const seen = new Set([start]); // addresses we have asked for or queued
  const listed = new Set<string>(); // addresses pages ended up at (after redirects)
  const pages: DiscoveredPage[] = [];
  let failed = 0;
  let level = [start];

  for (let depth = 0; depth <= CRAWL_MAX_DEPTH && level.length > 0; depth++) {
    const room = CRAWL_MAX_PAGES - pages.length;
    if (room <= 0) break;

    // Fetch this level (at most `room` pages), a few at a time.
    const results = await Promise.all(
      level
        .slice(0, room)
        .map((url) => limit(() => readPage(url, scope, deps, signal))),
    );

    const next: string[] = [];
    for (const result of results) {
      if (!result) {
        failed++;
        continue;
      }
      // A redirect can end on a page we reach again by another link (tailwindcss.com/docs
      // redirects to /docs/installation/using-vite): list each final address once.
      seen.add(result.url);
      if (!listed.has(result.url)) {
        listed.add(result.url);
        pages.push({ url: result.url, title: result.title });
      }
      for (const link of result.links) {
        if (!seen.has(link)) {
          seen.add(link);
          next.push(link);
        }
      }
    }
    level = next;
  }

  return {
    pages,
    note: failed > 0 ? `${failed} page(s) could not be fetched` : undefined,
  };
}

async function readPage(
  url: string,
  scope: Scope,
  deps: DiscoverDeps,
  signal?: AbortSignal,
): Promise<{ url: string; title: string; links: string[] } | null> {
  try {
    const page = await deps.fetchPage(url, { signal });
    const finalUrl = scope.accept(page.url) ?? url; // after redirects
    if (page.contentType !== "text/html")
      return { url: finalUrl, title: "", links: [] };
    return { url: finalUrl, ...readLinks(page.body, page.url, scope) };
  } catch {
    return null; // skip the page and carry on (SRS section 5)
  }
}
