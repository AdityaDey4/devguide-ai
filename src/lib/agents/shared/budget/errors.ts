import type { BudgetKind } from "./types";

/**
 * A run used up one of its limits. The runner ends the run as `failed` with `message` as the
 * reason and keeps the sections that were already written (SRS FR-GEN-11, section 7).
 */
export class BudgetExceeded extends Error {
  constructor(
    readonly kind: BudgetKind,
    readonly used: number,
    readonly limit: number,
  ) {
    super(describe(kind, used, limit));
    this.name = "BudgetExceeded";
  }
}

function describe(kind: BudgetKind, used: number, limit: number): string {
  switch (kind) {
    case "steps":
      return `Stopped: the run reached its limit of ${limit} steps`;
    case "fetches":
      return `Stopped: the run would fetch more than its limit of ${limit} pages (${used} needed)`;
    case "rounds":
      return `Stopped: the run reached its limit of ${limit} rounds of outside research`;
    case "time":
      return `Stopped: the run took longer than its limit of ${Math.round(limit / 1000)} seconds`;
  }
}
