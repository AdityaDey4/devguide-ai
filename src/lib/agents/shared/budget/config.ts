import type { BudgetLimits } from "./types";

// The limits of each kind of run. Change behaviour here.

/** Guide generation (SRS FR-GEN-11): 60 steps, 40 page fetches, 10 minutes. */
export const GENERATE_LIMITS: BudgetLimits = {
  maxSteps: 60,
  maxFetches: 40,
  maxRounds: Infinity,
  maxMs: 10 * 60 * 1000,
};

/**
 * Chat, per question (SRS FR-CHAT-11): 8 steps, 1 round of outside research, 45 seconds.
 * The pages fetched in that one round are limited by the round itself.
 */
export const CHAT_LIMITS: BudgetLimits = {
  maxSteps: 8,
  maxFetches: Infinity,
  maxRounds: 1,
  maxMs: 45 * 1000,
};
