import {
  combineUpdates,
  enterStep,
  GENERATE_LIMITS,
  spendFetches,
} from "../../../shared/budget";
import type { GenerateDeps } from "../../deps";
import type { GenerateUpdate } from "../../state";
import { readCitations } from "./citations";
import { COULD_NOT_WRITE } from "./config";
import type { WriteInputType } from "./input";
import { loadMaterial, withSnippets } from "./material";
import { buildMessages } from "./prompt";
import { storePages, storeSnippets } from "./store";

// Writes ONE section of the guide (FR-GEN-5, FR-GEN-6). The graph runs one of these per section,
// at the same time. Steps:
//
//   1. check the budget, reserve the page fetches
//   2. tell the UI the section started
//   3. fetch and clean the assigned pages           (loadMaterial) and, for a code-heavy
//      section, ask Context7 for code snippets      (deps.codeSnippets) at the same time
//   4. write from them, streaming text to the UI    (deps.write)  while saving the pages and
//      snippets to the knowledge base               (storePages, storeSnippets) in parallel
//   5. read which sources were cited                (readCitations)
//   6. tell the UI the section is done
//
//   input.section = { key: "installation", pageUrls: [2 urls], ... }
//     -> { sections: { installation: { markdown: "Install it with ... [1]", citations: [...] } } }
//
// Context7 is optional: if it is slow, rate-limited or down, deps.codeSnippets answers with an
// empty list and the section is written from the pages alone. Snippets are not page fetches and
// do not count against the fetch budget; each lookup is bounded by its own 20-second limit.
//
// A section with NO material at all (no page could be read and no snippets) is not an error: it
// is saved as "needs_review" with a note, so one broken page cannot lose the other six sections.

export async function writeSection(
  input: WriteInputType,
  deps: GenerateDeps,
): Promise<GenerateUpdate> {
  const { runId, technology, section } = input;
  const step = enterStep(input.budget, GENERATE_LIMITS);
  const fetches = spendFetches(
    input.budget,
    GENERATE_LIMITS,
    section.pageUrls.length,
  );
  const budget = combineUpdates(step, fetches);

  const events = deps.events(runId);
  await events.emit({
    type: "section_started",
    key: section.key,
    title: section.title,
  });

  const [{ material: pages, full }, snippets] = await Promise.all([
    loadMaterial(section.pageUrls, deps),
    section.codeHeavy
      ? deps.codeSnippets(technology.name, `${section.title}: ${section.goal}`)
      : Promise.resolve([]),
  ]);
  const material = withSnippets(pages, snippets);
  if (material.length === 0) {
    await events.emit({ type: "section_done", key: section.key, citations: 0 });
    return {
      sections: {
        [section.key]: {
          title: section.title,
          markdown: COULD_NOT_WRITE,
          citations: [],
          sources: [],
          status: "needs_review",
          issues: ["None of the source pages could be read."],
        },
      },
      budget,
    };
  }

  const [markdown] = await Promise.all([
    deps.write(buildMessages(technology, section, material), (piece) =>
      events.delta(section.key, piece),
    ),
    storePages(technology.id, full, deps),
    storeSnippets(technology.id, snippets, deps),
  ]);
  await events.flush();

  const { citations, unknown } = readCitations(markdown, material);
  await events.emit({
    type: "section_done",
    key: section.key,
    citations: citations.length,
  });

  return {
    sections: {
      [section.key]: {
        title: section.title,
        markdown,
        citations,
        sources: material,
        status: "draft",
        ...(unknown.length > 0 && {
          issues: [`Cites sources that do not exist: ${unknown.join(", ")}`],
        }),
      },
    },
    budget,
  };
}
