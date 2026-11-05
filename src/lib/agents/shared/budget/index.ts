// A hard limit on what one run may use: graph steps, page fetches and time (SRS FR-GEN-11 for
// guide generation, FR-CHAT-11 for chat). A run that hits a limit ends as `failed` with the
// reason, keeping the sections already written (SRS section 7).
//
//   state.budget  = newBudget()                                  // when the run starts
//
//   // inside every node:
//   const step = enterStep(state.budget, GENERATE_LIMITS);        // checks, then counts a step
//   const fetched = spendFetches(state.budget, GENERATE_LIMITS, pages.length);
//   return { ..., budget: combineUpdates(step, fetched) };        // the state reducer is mergeBudget
//
//   // in askUser, around the interrupt (a person may take hours):
//   return { budget: pauseClock(state.budget) };   ...   return { budget: resumeClock() };
//
// Plain functions on plain numbers, so the budget is saved with the graph state and survives a
// restart. Nothing is stored in memory or in a class.

export { BudgetExceeded } from "./errors";
export { CHAT_LIMITS, GENERATE_LIMITS } from "./config";
export { checkBudget, enterStep, spendFetches, spendRound } from "./check";
export {
  combineUpdates,
  mergeBudget,
  newBudget,
  pauseClock,
  resumeClock,
  timeUsed,
} from "./update";
export type { Budget, BudgetKind, BudgetLimits, BudgetUpdate } from "./types";
