import type { SectionDraft } from "../../state";
import { markersIn } from "../writeSection/citations";
import { missingNames } from "./codeNames";
import { findUncited } from "./paragraphs";

// Checks ONE section against its sources and lists what is wrong, in plain words. An empty list
// means the section passes. No model is used: the checks are exact and repeatable (FR-GEN-7).
//
//   checkDraft(draft) -> [
//     "2 explanatory paragraphs have no citation, e.g. \"You can then define...\"",
//     "The code uses names that do not appear in the sources: fakeMethod",
//   ]

const MAX_LISTED = 5;

export function checkDraft(draft: SectionDraft): string[] {
  const issues: string[] = [];
  const valid = new Set(draft.sources.map((source) => source.n));

  if (draft.citations.length === 0) {
    issues.push("The section cites no source.");
  }

  const unknown = markersIn(draft.markdown).filter((n) => !valid.has(n));
  if (unknown.length > 0) {
    issues.push(`It cites sources that do not exist: ${unknown.join(", ")}.`);
  }

  const uncited = findUncited(draft.markdown, valid);
  if (uncited.length > 0) {
    const noun = uncited.length === 1 ? "paragraph has" : "paragraphs have";
    issues.push(
      `${uncited.length} explanatory ${noun} no citation, e.g. "${uncited[0]}"`,
    );
  }

  const sourceText = draft.sources.map((source) => source.markdown).join("\n");
  const invented = missingNames(draft.markdown, sourceText);
  if (invented.length > 0) {
    issues.push(
      `The code uses names that do not appear in the sources: ${invented.slice(0, MAX_LISTED).join(", ")}.`,
    );
  }
  return issues;
}
