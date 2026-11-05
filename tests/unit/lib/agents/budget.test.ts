import { describe, expect, it } from "vitest";
import {
  BudgetExceeded,
  CHAT_LIMITS,
  checkBudget,
  combineUpdates,
  enterStep,
  GENERATE_LIMITS,
  mergeBudget,
  newBudget,
  pauseClock,
  resumeClock,
  spendFetches,
  spendRound,
  timeUsed,
} from "@/lib/agents/shared/budget";
import type { Budget } from "@/lib/agents/shared/budget";

const T0 = 1_000_000;
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const budget = (overrides: Partial<Budget> = {}): Budget => ({
  ...newBudget(T0),
  ...overrides,
});

describe("limits", () => {
  it("match the SRS: generation 60 steps / 40 fetches / 10 min, chat 8 steps / 1 round / 45 s", () => {
    expect(GENERATE_LIMITS).toMatchObject({
      maxSteps: 60,
      maxFetches: 40,
      maxMs: 10 * MINUTE,
    });
    expect(CHAT_LIMITS).toMatchObject({
      maxSteps: 8,
      maxRounds: 1,
      maxMs: 45 * SECOND,
    });
  });
});

describe("mergeBudget (the state reducer)", () => {
  it("adds counters, so parallel nodes cannot overwrite each other", () => {
    let state = budget();
    for (const update of [
      { steps: 1, fetches: 3 },
      { steps: 1, fetches: 4 },
      { steps: 1 },
    ]) {
      state = mergeBudget(state, update);
    }
    expect(state).toMatchObject({ steps: 3, fetches: 7, rounds: 0 });
  });

  it("replaces the clock values and leaves unmentioned ones alone", () => {
    const state = mergeBudget(budget(), { elapsedMs: 500, runningSince: null });
    expect(state).toMatchObject({ elapsedMs: 500, runningSince: null });
    expect(mergeBudget(state, { steps: 1 }).runningSince).toBeNull();
  });

  it("does not change the budget it was given", () => {
    const before = budget();
    mergeBudget(before, { steps: 5 });
    expect(before.steps).toBe(0);
  });
});

describe("combineUpdates", () => {
  it("adds counters and lets a clock value win", () => {
    expect(
      combineUpdates(
        { steps: 1 },
        { fetches: 4 },
        { steps: 1, runningSince: 9 },
      ),
    ).toMatchObject({ steps: 2, fetches: 4, runningSince: 9 });
  });
});

describe("checkBudget", () => {
  it("passes a fresh run", () => {
    expect(() => checkBudget(budget(), GENERATE_LIMITS, T0)).not.toThrow();
  });

  it("stops at the step limit: the 61st step is refused", () => {
    expect(() =>
      checkBudget(budget({ steps: 59 }), GENERATE_LIMITS, T0),
    ).not.toThrow();
    const call = () => checkBudget(budget({ steps: 60 }), GENERATE_LIMITS, T0);
    expect(call).toThrow(BudgetExceeded);
    expect(call).toThrow(/limit of 60 steps/);
  });

  it("stops when the time is over, and says how long the limit was", () => {
    const call = () =>
      checkBudget(budget(), GENERATE_LIMITS, T0 + 10 * MINUTE + 1);
    expect(call).toThrow(/limit of 600 seconds/);
    expect(() =>
      checkBudget(budget(), GENERATE_LIMITS, T0 + 10 * MINUTE),
    ).not.toThrow();
  });

  it("carries the kind, the amount used and the limit", () => {
    try {
      checkBudget(budget({ steps: 8 }), CHAT_LIMITS, T0);
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ kind: "steps", used: 8, limit: 8 });
    }
  });
});

describe("enterStep", () => {
  it("counts one step when the run may continue", () => {
    expect(enterStep(budget(), GENERATE_LIMITS, T0)).toEqual({ steps: 1 });
  });

  it("refuses, and so ends the run, when a limit is already used up", () => {
    expect(() => enterStep(budget({ steps: 60 }), GENERATE_LIMITS, T0)).toThrow(
      BudgetExceeded,
    );
  });
});

describe("spendFetches", () => {
  it("allows fetches up to the limit exactly", () => {
    expect(spendFetches(budget({ fetches: 36 }), GENERATE_LIMITS, 4)).toEqual({
      fetches: 4,
    });
  });

  it("refuses BEFORE fetching when the pages would go over", () => {
    const call = () =>
      spendFetches(budget({ fetches: 37 }), GENERATE_LIMITS, 4);
    expect(call).toThrow(BudgetExceeded);
    expect(call).toThrow(/more than its limit of 40 pages \(41 needed\)/);
  });

  it("has no fetch limit in chat (the one round bounds it)", () => {
    expect(() => spendFetches(budget(), CHAT_LIMITS, 500)).not.toThrow();
  });
});

describe("spendRound", () => {
  it("allows one round of outside research in chat, not a second", () => {
    expect(spendRound(budget(), CHAT_LIMITS)).toEqual({ rounds: 1 });
    expect(() => spendRound(budget({ rounds: 1 }), CHAT_LIMITS)).toThrow(
      /limit of 1 rounds/,
    );
  });
});

describe("the clock", () => {
  it("counts banked time plus the stretch running now", () => {
    const state = budget({ elapsedMs: 5 * SECOND, runningSince: T0 });
    expect(timeUsed(state, T0 + 2 * SECOND)).toBe(7 * SECOND);
  });

  it("does not count time while paused, e.g. while a person chooses a technology", () => {
    let state = budget();
    state = mergeBudget(state, pauseClock(state, T0 + 3 * SECOND));
    expect(state).toMatchObject({ elapsedMs: 3 * SECOND, runningSince: null });

    // two hours pass...
    expect(timeUsed(state, T0 + 2 * 60 * MINUTE)).toBe(3 * SECOND);
    expect(() =>
      checkBudget(state, GENERATE_LIMITS, T0 + 2 * 60 * MINUTE),
    ).not.toThrow();

    // ...the answer arrives, the clock runs again from there
    const later = T0 + 2 * 60 * MINUTE;
    state = mergeBudget(state, resumeClock(later));
    expect(timeUsed(state, later + 4 * SECOND)).toBe(7 * SECOND);
  });

  it("does not charge a restarted run for the downtime", () => {
    // The process died with the clock running since T0; it is picked up an hour later.
    const saved = budget({ elapsedMs: 2 * MINUTE, runningSince: T0 });
    const restartedAt = T0 + 60 * MINUTE;
    const state = mergeBudget(saved, resumeClock(restartedAt));
    expect(timeUsed(state, restartedAt + 1 * SECOND)).toBe(2 * MINUTE + SECOND);
  });

  it("ignores a clock that appears to run backwards", () => {
    expect(timeUsed(budget({ runningSince: T0 + 10 * SECOND }), T0)).toBe(0);
  });
});
