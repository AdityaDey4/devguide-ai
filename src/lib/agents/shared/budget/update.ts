import type { Budget, BudgetUpdate } from "./types";

// Changing a budget. Nothing here mutates: every function returns a new value or an update.
//
//   budget = newBudget()                        -> { steps: 0, fetches: 0, rounds: 0, elapsedMs: 0, runningSince: <now> }
//   mergeBudget(budget, { steps: 1 })           -> steps 1       (the graph state reducer)
//   pauseClock(budget)  -> { elapsedMs: 4200, runningSince: null }   (waiting for the user)
//   resumeClock()       -> { runningSince: <now> }                    (answer arrived, or run restarted)

export function newBudget(now: number = Date.now()): Budget {
  return { steps: 0, fetches: 0, rounds: 0, elapsedMs: 0, runningSince: now };
}

/**
 * The graph state reducer. Counters add up, so several nodes running at the same time can each
 * report their own steps and fetches without overwriting one another.
 */
export function mergeBudget(current: Budget, update: BudgetUpdate): Budget {
  return {
    steps: current.steps + (update.steps ?? 0),
    fetches: current.fetches + (update.fetches ?? 0),
    rounds: current.rounds + (update.rounds ?? 0),
    elapsedMs: update.elapsedMs ?? current.elapsedMs,
    runningSince:
      update.runningSince === undefined
        ? current.runningSince
        : update.runningSince,
  };
}

/** Several updates from one node as a single update: counters add up, a clock value wins. */
export function combineUpdates(...updates: BudgetUpdate[]): BudgetUpdate {
  return updates.reduce<BudgetUpdate>(
    (all, update) => ({
      ...all,
      ...update,
      steps: (all.steps ?? 0) + (update.steps ?? 0),
      fetches: (all.fetches ?? 0) + (update.fetches ?? 0),
      rounds: (all.rounds ?? 0) + (update.rounds ?? 0),
    }),
    {},
  );
}

/** Time used so far: what was banked, plus the stretch that is running now. */
export function timeUsed(budget: Budget, now: number = Date.now()): number {
  const running = budget.runningSince === null ? 0 : now - budget.runningSince;
  return budget.elapsedMs + Math.max(0, running);
}

/** Stops the clock while the run waits for a person. Returns the update to store. */
export function pauseClock(
  budget: Budget,
  now: number = Date.now(),
): BudgetUpdate {
  return { elapsedMs: timeUsed(budget, now), runningSince: null };
}

/**
 * Starts the clock again, after an answer arrives or when a killed run is picked up from its
 * checkpoint. The stretch that was running when the process died is not counted: nobody knows
 * when it died, and the user should not pay for downtime.
 */
export function resumeClock(now: number = Date.now()): BudgetUpdate {
  return { runningSince: now };
}
