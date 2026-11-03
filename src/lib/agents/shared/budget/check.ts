import { BudgetExceeded } from "./errors";
import { timeUsed } from "./update";
import type { Budget, BudgetLimits, BudgetUpdate } from "./types";

// Asking "may the run continue?". Each function throws BudgetExceeded or returns the update the
// node should hand back to the graph.
//
//   const update = enterStep(state.budget, GENERATE_LIMITS);        // first line of every node
//   const fetches = spendFetches(state.budget, GENERATE_LIMITS, 4); // before fetching 4 pages
//   return { budget: ..., sections: ... };

/** Throws when the run has already used up its steps, outside rounds, or time. */
export function checkBudget(
  budget: Budget,
  limits: BudgetLimits,
  now: number = Date.now(),
): void {
  if (budget.steps >= limits.maxSteps) {
    throw new BudgetExceeded("steps", budget.steps, limits.maxSteps);
  }
  if (budget.rounds > limits.maxRounds) {
    throw new BudgetExceeded("rounds", budget.rounds, limits.maxRounds);
  }
  const used = timeUsed(budget, now);
  if (used > limits.maxMs) throw new BudgetExceeded("time", used, limits.maxMs);
}

/** The first thing every node does: check the limits, then count this node as one step. */
export function enterStep(
  budget: Budget,
  limits: BudgetLimits,
  now: number = Date.now(),
): BudgetUpdate {
  checkBudget(budget, limits, now);
  return { steps: 1 };
}

/**
 * Call BEFORE fetching `count` pages. Refuses (instead of noticing afterwards) when they would
 * take the run over its limit. Nodes running in parallel each see the budget as it was when they
 * started, so the total can pass the limit by the pages of the other nodes; the next
 * `checkBudget` is the safety net.
 */
export function spendFetches(
  budget: Budget,
  limits: BudgetLimits,
  count: number,
): BudgetUpdate {
  const needed = budget.fetches + count;
  if (needed > limits.maxFetches) {
    throw new BudgetExceeded("fetches", needed, limits.maxFetches);
  }
  return { fetches: count };
}

/** Call before a round of outside research (chat). */
export function spendRound(budget: Budget, limits: BudgetLimits): BudgetUpdate {
  if (budget.rounds + 1 > limits.maxRounds) {
    throw new BudgetExceeded("rounds", budget.rounds + 1, limits.maxRounds);
  }
  return { rounds: 1 };
}
