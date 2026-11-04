import { technologyFor } from "../../../../ingest/technology";
import {
  combineUpdates,
  enterStep,
  GENERATE_LIMITS,
} from "../../../shared/budget";
import type { GenerateDeps } from "../../deps";
import { GenerateError } from "../../errors";
import type { GenerateStateType, GenerateUpdate } from "../../state";
import { findVersion, isGrounded } from "./grounding";
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
      .filter((candidate) => isGrounded(candidate.url, hits))
      .slice(0, 3);
    if (candidates.length >= 2) {
      return { candidates, technology: null, budget: step };
    }
  }

  // Past this point we need ONE technology whose site is among the search results.
  const officialUrl = answer.officialUrl ?? "";
  if (
    answer.outcome !== "single" ||
    !answer.name ||
    !isGrounded(officialUrl, hits)
  ) {
    throw new GenerateError(
      `Could not find the official documentation for "${state.query}"`,
      "technology_not_found",
    );
  }
  // If the docs address is not trustworthy, the official site is used: discovery then crawls it.
  const docsUrl = isGrounded(answer.docsUrl, hits)
    ? answer.docsUrl!
    : officialUrl;

  const version = findVersion(hits);
  const { slug } = technologyFor(docsUrl, { name: answer.name });
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
