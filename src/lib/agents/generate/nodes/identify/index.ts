import { slugFromName, technologyFor } from "../../../../ingest/technology";
import {
  combineUpdates,
  enterStep,
  GENERATE_LIMITS,
} from "../../../shared/budget";
import type { GenerateDeps } from "../../deps";
import { GenerateError } from "../../errors";
import type { GenerateStateType, GenerateUpdate } from "../../state";
import { findDocsStart, findVersion, resultUrl } from "./grounding";
import { buildMessages } from "./prompt";
import { IdentifyAnswer } from "./schema";

// Step 1 of the guide graph: which technology is this, and where are its docs? (FR-GEN-2,
// FR-SRCH-4). The answer is one technology, or 2 to 3 candidates for the person to choose from.
//
//   state.query = "langgraph"  ->  { technology: { name: "LangGraph", docsUrl: "https://...", ... } }
//   state.query = "mercury"    ->  { candidates: [{ name: "Mercury (Python)" ... }, ...] }  (askUser next)
//
// Steps: search the web, ask the small model, keep only URLs that really appeared in the
// results, save the technology in the database, tell the UI.

const SEARCH_SUFFIX = "official documentation";

export async function identify(
  state: GenerateStateType,
  deps: GenerateDeps,
): Promise<GenerateUpdate> {
  const step = enterStep(state.budget, GENERATE_LIMITS);

  const hits = await deps.searchWeb(`${state.query} ${SEARCH_SUFFIX}`);
  const answer = await deps.ask(
    "small",
    IdentifyAnswer,
    buildMessages(state.query, hits, state.chosenUrl),
  );

  if (answer.outcome === "ambiguous" && !state.chosenUrl) {
    const candidates = answer.candidates
      .flatMap(({ name, description, result }) => {
        const url = resultUrl(result, hits);
        return url ? [{ name, description, url }] : [];
      })
      .slice(0, 3);
    if (candidates.length >= 2) {
      return { candidates, technology: null, budget: step };
    }
  }

  // Past this point we need ONE technology whose site is one of the search results.
  const officialUrl = resultUrl(answer.officialResult, hits);
  if (answer.outcome !== "single" || !answer.name || !officialUrl) {
    throw new GenerateError(
      `Could not find the official documentation for "${state.query}"`,
      "technology_not_found",
    );
  }
  // Not asked of the model (asked, it once repeated a path until the token limit): the docs
  // start page is worked out from the search results.
  const docsUrl = findDocsStart(officialUrl, hits);

  const version = findVersion(hits);
  // The slug comes from the name ("Java" -> "java"), not the address (docs.oracle.com -> "oracle");
  // the address is only the fallback for names that make no usable slug (like "C++").
  const nameSlug = slugFromName(answer.name);
  const { slug } = technologyFor(docsUrl, {
    name: answer.name,
    ...(nameSlug && { slug: nameSlug }),
  });
  const id = await deps.saveTechnology({
    name: answer.name,
    slug,
    officialUrl,
    docsUrl,
    ...(version && { latestVersion: version }),
  });
  const technology = {
    id,
    name: answer.name,
    slug,
    officialUrl,
    docsUrl,
    version,
  };

  await deps.events(state.runId).emit({
    type: "identified",
    name: technology.name,
    officialUrl,
    docsUrl,
    ...(technology.version && { version: technology.version }),
  });
  return {
    technology,
    candidates: [],
    chosenUrl: null,
    budget: combineUpdates(step),
  };
}
