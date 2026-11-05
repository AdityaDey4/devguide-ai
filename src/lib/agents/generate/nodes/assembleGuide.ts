import { chunkMarkdown } from "../../../rag/chunker";
import {
  combineUpdates,
  enterStep,
  GENERATE_LIMITS,
} from "../../shared/budget";
import type { GenerateDeps } from "../deps";
import type { GuideSection } from "../guide/saveGuide";
import type { GenerateStateType, GenerateUpdate } from "../state";

// The last step: save the guide (FR-GEN-1, section 5.1 "assembleGuide").
//
//   7 checked sections  ->  a guide row + guide_versions v1 (or v2, v3... when generated again)
//                           + the guide's own text as searchable chunks (source_type "guide")
//                           + a `completed` event with the guide and version ids
//
// The guide is "ready" when every section cites at least one source (AC-1), otherwise "partial".
// A section that still failed its checks after two rewrites is kept with needs_review = true: the
// reader sees it flagged instead of losing it.

export async function assembleGuide(
  state: GenerateStateType,
  deps: GenerateDeps,
): Promise<GenerateUpdate> {
  const technology = state.technology;
  if (!technology)
    throw new Error("assembleGuide needs an identified technology");
  const step = enterStep(state.budget, GENERATE_LIMITS);

  // 1. The sections in the order of the outline, in the shape the database stores.
  const sections: GuideSection[] = state.outline.map(({ key }) => {
    const draft = state.sections[key];
    if (!draft)
      throw new Error(`assembleGuide: section "${key}" was never written`);
    return {
      key,
      title: draft.title,
      markdown: draft.markdown,
      citations: draft.citations,
      needs_review: draft.status === "needs_review",
    };
  });
  const status = sections.every((s) => s.citations.length > 0)
    ? "ready"
    : "partial";

  // 2. Save the guide and its new version.
  const saved = await deps.saveGuide({
    technologyId: technology.id,
    sections,
    status,
  });

  // 3. Make the guide's own text searchable for the chat (sections that cite nothing are only
  //    "could not be written" notes and are left out).
  for (const section of sections.filter((s) => s.citations.length > 0)) {
    await deps.storeChunks({
      technologyId: technology.id,
      guideId: saved.guideId,
      source: {
        url: `guide:${technology.slug}`,
        title: `${technology.name} guide`,
        type: "guide",
      },
      chunks: chunkMarkdown(section.markdown, {
        title: `${technology.name} guide: ${section.title}`,
      }),
      ...(technology.version && { techVersion: technology.version }),
    });
  }

  // 4. Tell the UI.
  await deps.events(state.runId).emit({
    type: "completed",
    guideId: saved.guideId,
    versionId: saved.versionId,
  });
  return {
    guideId: saved.guideId,
    versionId: saved.versionId,
    budget: combineUpdates(step),
  };
}
