import { interrupt } from "@langchain/langgraph";
import { z } from "zod";
import {
  combineUpdates,
  enterStep,
  GENERATE_LIMITS,
  pauseClock,
  resumeClock,
} from "../../shared/budget";
import type { GenerateDeps } from "../deps";
import type { GenerateStateType, GenerateUpdate } from "../state";

// When the name is ambiguous, the run stops until a person chooses (FR-SRCH-5). Two nodes:
//
//   askUser      tells the UI which candidates there are and stops the budget clock. Finishes.
//   applyChoice  waits (interrupt) for the answer, restarts the clock, and sets up identify again.
//
// They are separate on purpose: when a run is resumed LangGraph starts the interrupted node again
// from its first line. If pausing the clock were in the same node it would run twice, and the
// second time it would count the whole wait as working time.
//
// The answer sent when resuming (`graph.invoke(new Command({ resume: answer }), config)`):
//   { choice: "candidate", url: "https://..." }      one of the offered technologies
//   { choice: "refine", query: "a better name" }     "None of these": search again

export const ChoiceAnswer = z.discriminatedUnion("choice", [
  z.object({ choice: z.literal("candidate"), url: z.url() }),
  z.object({
    choice: z.literal("refine"),
    query: z.string().trim().min(2).max(60),
  }),
]);

export async function askUser(
  state: GenerateStateType,
  deps: GenerateDeps,
): Promise<GenerateUpdate> {
  const step = enterStep(state.budget, GENERATE_LIMITS);
  await deps.events(state.runId).emit({
    type: "needs_choice",
    candidates: state.candidates,
  });
  return { budget: combineUpdates(step, pauseClock(state.budget)) };
}

export function applyChoice(state: GenerateStateType): GenerateUpdate {
  // Nothing may happen before interrupt(): this line runs again on resume.
  const answer = ChoiceAnswer.parse(
    interrupt({ type: "choose_technology", candidates: state.candidates }),
  );

  const clock = resumeClock();
  if (answer.choice === "refine") {
    return {
      query: answer.query,
      chosenUrl: null,
      candidates: [],
      budget: clock,
    };
  }
  return { chosenUrl: answer.url, candidates: [], budget: clock };
}
