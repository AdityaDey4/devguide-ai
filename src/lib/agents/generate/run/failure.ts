import { BudgetExceeded } from "../../shared/budget";
import { LlmConfigError } from "../../shared/llm";
import { TavilyError } from "../../shared/tavily";
import { GenerateError } from "../errors";

// Turns whatever went wrong into one readable sentence for the person and for `runs.error`
// (SRS section 7: "End as failed with reason").
//
//   describeFailure(new BudgetExceeded("steps", 60, 60)) -> "Stopped: the run reached its limit of 60 steps"
//   describeFailure(new TypeError("x is undefined"))     -> "Something went wrong: x is undefined"
//
// Messages we wrote ourselves are shown as they are. Anything else is shortened, and anything
// that looks like an API key is hidden, because this text is saved and shown.

/** The run cannot start because another run is already generating the same technology. */
export class RunConflict extends Error {
  constructor(technologyName: string) {
    super(
      `Another run is already generating a guide for ${technologyName}. Search for it again to follow that run.`,
    );
    this.name = "RunConflict";
  }
}

const OURS = [
  BudgetExceeded,
  GenerateError,
  TavilyError,
  LlmConfigError,
  RunConflict,
];
const MAX_LENGTH = 300;

export function describeFailure(error: unknown): string {
  if (OURS.some((type) => error instanceof type)) {
    return (error as Error).message;
  }
  const message = error instanceof Error ? error.message : String(error);
  return `Something went wrong: ${hideKeys(message).slice(0, MAX_LENGTH)}`;
}

/** sk-... (OpenAI), tvly-... (Tavily) and long key-like tokens. */
function hideKeys(text: string): string {
  return text
    .replace(/\b(sk|tvly|ctx7sk)-[A-Za-z0-9_*-]{6,}/g, "$1-***")
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_.-]+/g, "***");
}
