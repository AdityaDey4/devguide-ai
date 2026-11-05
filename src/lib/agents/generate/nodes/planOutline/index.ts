import {
  combineUpdates,
  enterStep,
  GENERATE_LIMITS,
} from "../../../shared/budget";
import type { GenerateDeps } from "../../deps";
import type { GenerateStateType, GenerateUpdate } from "../../state";
import { buildMessages } from "./prompt";
import { toOutline } from "./repair";
import { OutlineAnswer } from "./schema";

// Step 3: which documentation pages feed which section? (FR-GEN-4)
//
//   state.discoveredPages (up to 500)  ->  { outline: [7 sections, each with 1 to 4 pageUrls] }
//
// The 7 sections are fixed (sections.ts). The small model only matches pages to them; repair.ts
// then makes sure the result is valid whatever the model said.

export async function planOutline(
  state: GenerateStateType,
  deps: GenerateDeps,
): Promise<GenerateUpdate> {
  const technology = state.technology;
  if (!technology || state.discoveredPages.length === 0) {
    throw new Error("planOutline needs an identified technology and its pages");
  }
  const step = enterStep(state.budget, GENERATE_LIMITS);

  const answer = await deps.ask(
    "small",
    OutlineAnswer,
    buildMessages(technology.name, state.discoveredPages),
  );
  const outline = toOutline(answer, state.discoveredPages);

  await deps.events(state.runId).emit({
    type: "outline",
    sections: outline.map(({ key, title }) => ({ key, title })),
  });
  return { outline, budget: combineUpdates(step) };
}
