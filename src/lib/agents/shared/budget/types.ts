/** What a run has used so far. Plain numbers, so it is saved in the graph state and `runs.budget`. */
export type Budget = {
  /** Graph nodes entered. */
  steps: number;
  /** Pages fetched from the web. */
  fetches: number;
  /** Rounds of external research (chat only). */
  rounds: number;
  /** Running time already banked, in ms. Time while the clock is paused is never counted. */
  elapsedMs: number;
  /** When the clock was last started (ms since 1970), or null while it is paused. */
  runningSince: number | null;
};

/** The most a run may use. `Infinity` means "no limit of this kind". */
export type BudgetLimits = {
  maxSteps: number;
  maxFetches: number;
  maxRounds: number;
  maxMs: number;
};

/**
 * What a node hands back to change the budget. `steps`, `fetches` and `rounds` are ADDED to the
 * current values (so parallel nodes can all report); `elapsedMs` and `runningSince` REPLACE them.
 */
export type BudgetUpdate = {
  steps?: number;
  fetches?: number;
  rounds?: number;
  elapsedMs?: number;
  runningSince?: number | null;
};

export type BudgetKind = "steps" | "fetches" | "rounds" | "time";
