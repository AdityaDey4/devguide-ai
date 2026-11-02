import { discoverDocs } from "../fetch/discover";
import { fetchPage } from "../fetch/fetchPage";
import { createLimiter } from "../limiter";
import { storeChunks, upsertTechnology } from "../rag/store";
import { createServiceClient } from "../supabase/service";
import { DEFAULT_MAX_PAGES, PAGE_CONCURRENCY } from "./config";
import { ingestPage } from "./ingestPage";
import { technologyFor } from "./technology";
import type {
  IngestDeps,
  IngestOptions,
  IngestResult,
  PageOutcome,
} from "./types";

export type { IngestOptions, IngestResult, PageOutcome } from "./types";
export { technologyFor } from "./technology";

// Reads a documentation site into the knowledge base (SRS FR-ING-1, FR-GEN-8).
//
//   const result = await ingestSite("https://zod.dev");
//   result.totals -> { pages: 17, stored: 15, failed: 2, inserted: 142, skipped: 0, tokens: 41000, ... }
//
// Run it again: { inserted: 0, skipped: 142, tokens: 0 } (nothing new, nothing to pay for).
// Read this file first: it is the whole belt. Server only (database key, OpenAI key).

const realDeps: IngestDeps = {
  db: createServiceClient,
  upsertTechnology,
  discoverDocs,
  fetchPage,
  storeChunks,
};

export async function ingestSite(
  docsUrl: string,
  options: IngestOptions = {},
  deps: IngestDeps = realDeps,
): Promise<IngestResult> {
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;

  // 1. Who is this about? (only a name and a short id, nothing is written yet)
  const { name, slug } = technologyFor(docsUrl, options);

  // 2. Which pages does the site have? (llms.txt, then sitemap, then a crawl)
  const discovery = await deps.discoverDocs(docsUrl, {
    signal: options.signal,
  });
  const pages = discovery.pages.slice(0, maxPages);
  const summary = {
    source: discovery.source,
    found: discovery.pages.length,
    cutByMaxPages: discovery.pages.length > pages.length,
    attempts: discovery.attempts,
  };
  // Nothing found: leave the database untouched (no empty technology left behind).
  if (pages.length === 0) {
    return {
      technology: { id: null, name, slug },
      discovery: summary,
      outcomes: [],
      totals: sum([]),
    };
  }

  // 3. Make sure the technology exists in the database.
  const id = await deps.upsertTechnology(deps.db(), {
    name,
    slug,
    docsUrl,
    officialUrl: new URL(docsUrl).origin,
  });

  // 4. Read the pages, a few at a time. Each one: fetch, clean, chunk, store.
  const limit = createLimiter(PAGE_CONCURRENCY);
  let done = 0;
  const outcomes: PageOutcome[] = await Promise.all(
    pages.map((page) =>
      limit(async () => {
        const outcome = await ingestPage(page, id, deps, options.signal);
        options.onPage?.(outcome, { done: ++done, total: pages.length });
        return outcome;
      }),
    ),
  );

  // 5. Add it all up.
  return {
    technology: { id, name, slug },
    discovery: summary,
    outcomes,
    totals: sum(outcomes),
  };
}

function sum(outcomes: PageOutcome[]): IngestResult["totals"] {
  const count = (status: PageOutcome["status"]) =>
    outcomes.filter((outcome) => outcome.status === status).length;
  const total = (field: "chunks" | "inserted" | "skipped" | "tokens") =>
    outcomes.reduce((acc, outcome) => acc + outcome[field], 0);

  return {
    pages: outcomes.length,
    stored: count("stored"),
    tooShort: count("too_short"),
    failed: count("failed"),
    chunks: total("chunks"),
    inserted: total("inserted"),
    skipped: total("skipped"),
    tokens: total("tokens"),
  };
}
