import type { GenerateStateType } from "../state";
import type { RunDeps } from "./types";

// When a run fails after writing some sections, keep them as a partial draft instead of losing
// the work (SRS section 7). Every section is flagged "needs review", because none of them went
// through the whole check. A guide that already exists is never replaced by a partial one.

export async function savePartial(
  values: GenerateStateType,
  deps: RunDeps,
): Promise<void> {
  const technology = values.technology;
  if (!technology) return;

  const written = values.outline.filter((def) => values.sections[def.key]);
  if (written.length === 0) return;
  if (await deps.store.hasGuide(technology.id)) return;

  await deps.generate.saveGuide({
    technologyId: technology.id,
    status: "partial",
    changeNote: "Partial draft: the run stopped before it finished",
    sections: written.map((def) => {
      const draft = values.sections[def.key];
      return {
        key: def.key,
        title: draft.title,
        markdown: draft.markdown,
        citations: draft.citations,
        needs_review: draft.status !== "ok",
      };
    }),
  });
}
