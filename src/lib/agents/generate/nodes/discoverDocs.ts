import {
  combineUpdates,
  enterStep,
  GENERATE_LIMITS,
  spendFetches,
} from "../../shared/budget";
import { MIN_DISCOVERED_PAGES } from "../config";
import type { GenerateDeps } from "../deps";
import { GenerateError } from "../errors";
import type { GenerateStateType, GenerateUpdate } from "../state";

// Step 2: which pages does the documentation site have? (FR-GEN-3)
//
//   state.technology.docsUrl = "https://zod.dev"
//     -> { discoveredPages: [{ url: "https://zod.dev/api", title: "Defining schemas" }, ...] }
//
// llms.txt first, then the sitemap, then a link crawl; at most 500 pages (lib/fetch/discover).
// If that finds fewer than MIN_DISCOVERED_PAGES pages and the official site is at a different
// address (java: docs start page "https://docs.oracle.com" was a stub, the official site is
// "https://docs.oracle.com/en/java"), that address is tried too and the bigger result is kept.
// Budget: each source tried counts as one fetch. The crawl, the only source that fetches many
// pages, is bounded by its own caps (depth 2, 100 pages) rather than by this budget.

export async function discoverDocs(
  state: GenerateStateType,
  deps: GenerateDeps,
): Promise<GenerateUpdate> {
  const technology = state.technology;
  if (!technology)
    throw new Error("discoverDocs needs an identified technology");
  const step = enterStep(state.budget, GENERATE_LIMITS);

  let docsUrl = technology.docsUrl;
  let found = await deps.discoverDocs(docsUrl);
  let attempts = found.attempts.length;
  if (
    found.pages.length < MIN_DISCOVERED_PAGES &&
    sameAddress(technology.officialUrl, docsUrl) === false
  ) {
    const retry = await deps
      .discoverDocs(technology.officialUrl)
      .catch(() => null);
    if (retry) {
      attempts += retry.attempts.length;
      if (retry.pages.length > found.pages.length) {
        found = retry;
        docsUrl = technology.officialUrl;
      }
    }
  }
  if (found.pages.length === 0) {
    throw new GenerateError(
      `No documentation pages were found at ${technology.docsUrl}`,
      "no_docs",
    );
  }

  const fetches = spendFetches(state.budget, GENERATE_LIMITS, attempts);
  await deps.events(state.runId).emit({
    type: "docs_found",
    count: found.pages.length,
  });
  // The start page that worked is the one kept, here and in the database.
  if (docsUrl !== technology.docsUrl) {
    await deps.saveTechnology({
      name: technology.name,
      slug: technology.slug,
      officialUrl: technology.officialUrl,
      docsUrl,
      ...(technology.version && { latestVersion: technology.version }),
    });
  }
  return {
    ...(docsUrl !== technology.docsUrl && {
      technology: { ...technology, docsUrl },
    }),
    discoveredPages: found.pages.map(({ url, title }) => ({ url, title })),
    budget: combineUpdates(step, fetches),
  };
}

const sameAddress = (a: string, b: string) =>
  a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
