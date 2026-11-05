import {
  combineUpdates,
  enterStep,
  GENERATE_LIMITS,
  spendFetches,
} from "../../shared/budget";
import type { GenerateDeps } from "../deps";
import { GenerateError } from "../errors";
import type { GenerateStateType, GenerateUpdate } from "../state";

// Step 2: which pages does the documentation site have? (FR-GEN-3)
//
//   state.technology.docsUrl = "https://zod.dev"
//     -> { discoveredPages: [{ url: "https://zod.dev/api", title: "Defining schemas" }, ...] }
//
// llms.txt first, then the sitemap, then a link crawl; at most 500 pages (lib/fetch/discover).
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

  const found = await deps.discoverDocs(technology.docsUrl);
  if (found.pages.length === 0) {
    throw new GenerateError(
      `No documentation pages were found at ${technology.docsUrl}`,
      "no_docs",
    );
  }

  const fetches = spendFetches(
    state.budget,
    GENERATE_LIMITS,
    found.attempts.length,
  );
  await deps.events(state.runId).emit({
    type: "docs_found",
    count: found.pages.length,
  });
  return {
    discoveredPages: found.pages.map(({ url, title }) => ({ url, title })),
    budget: combineUpdates(step, fetches),
  };
}
