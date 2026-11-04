import {
  combineUpdates,
  enterStep,
  GENERATE_LIMITS,
} from "../../../shared/budget";
import type { GenerateDeps } from "../../deps";
import type { GenerateUpdate } from "../../state";
import { readCitations } from "../writeSection/citations";
import type { RewriteInputType } from "./input";
import { buildRewriteMessages } from "./prompt";

// Writes a section again after the checker found problems (FR-GEN-7). Same sources, same rules,
// plus the old draft and the list of problems. The graph runs one of these per failing section.
//
//   input.draft.issues = ["2 explanatory paragraphs have no citation, e.g. ..."]
//     -> { sections: { installation: <new draft, status "draft"> }, checkAttempts: { installation: 1 } }
//
// The new draft is not trusted: it goes back to checkSections. The attempt counter is what stops
// the loop (a section is rewritten at most MAX_REWRITES times).

export async function rewriteSection(
  input: RewriteInputType,
  deps: GenerateDeps,
): Promise<GenerateUpdate> {
  const { runId, technology, section, draft, attempts } = input;
  const step = enterStep(input.budget, GENERATE_LIMITS);

  const events = deps.events(runId);
  await events.emit({
    type: "section_started",
    key: section.key,
    title: section.title,
  });

  const markdown = await deps.write(
    buildRewriteMessages(technology, section, draft),
    (piece) => events.delta(section.key, piece),
  );
  await events.flush();

  const { citations } = readCitations(markdown, draft.sources);
  await events.emit({
    type: "section_done",
    key: section.key,
    citations: citations.length,
  });

  return {
    sections: {
      [section.key]: {
        title: draft.title,
        markdown,
        citations,
        sources: draft.sources,
        status: "draft", // not trusted yet: checkSections looks at it again
      },
    },
    checkAttempts: { [section.key]: attempts + 1 },
    budget: combineUpdates(step),
  };
}
