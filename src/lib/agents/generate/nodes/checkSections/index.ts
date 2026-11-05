import {
  combineUpdates,
  enterStep,
  GENERATE_LIMITS,
} from "../../../shared/budget";
import { MAX_REWRITES } from "../../config";
import type { GenerateDeps } from "../../deps";
import type {
  GenerateStateType,
  GenerateUpdate,
  SectionDraft,
} from "../../state";
import { checkDraft } from "./check";

// Step after writing: does every section stand on its sources? (FR-GEN-7)
//
//   sections written (status "draft")  ->  each becomes:
//     "ok"            no problems found
//     "draft"         problems found and rewrites left: the graph sends it to rewriteSection
//     "needs_review"  problems found after the 2nd rewrite: kept, flagged for the reader (amber callout)
//
// Sections that could not be written at all are already "needs_review" and are skipped. This node
// runs again after every round of rewrites and only looks at sections still marked "draft".

export async function checkSections(
  state: GenerateStateType,
  deps: GenerateDeps,
): Promise<GenerateUpdate> {
  const step = enterStep(state.budget, GENERATE_LIMITS);

  const pending = Object.entries(state.sections).filter(
    ([, draft]) => draft.status === "draft",
  );
  if (pending.length > 0) {
    await deps.events(state.runId).emit({
      type: "checking",
      keys: pending.map(([key]) => key),
    });
  }

  const sections: Record<string, SectionDraft> = {};
  for (const [key, draft] of pending) {
    const issues = checkDraft(draft);
    const rewritesLeft = (state.checkAttempts[key] ?? 0) < MAX_REWRITES;

    const checked: SectionDraft = { ...draft };
    if (issues.length === 0) {
      delete checked.issues;
      checked.status = "ok";
    } else {
      checked.issues = issues;
      checked.status = rewritesLeft ? "draft" : "needs_review";
    }
    sections[key] = checked;
  }
  return { sections, budget: combineUpdates(step) };
}
