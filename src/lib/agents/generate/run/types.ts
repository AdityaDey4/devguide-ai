import type { Budget } from "../../shared/budget";
import type { buildGenerateGraph } from "../graph";
import type { GenerateDeps } from "../deps";
import type { Candidate } from "../state";

/** How a run ended, or where it is waiting. */
export type RunOutcome =
  | { status: "completed"; runId: string; guideId: string; versionId: string }
  /** The name was ambiguous: answer with `resumeGeneration(runId, { choice, ... })`. */
  | { status: "waiting_user"; runId: string; candidates: Candidate[] }
  | { status: "failed"; runId: string; reason: string };

/** The `runs` table, as the runner uses it. */
export type RunStore = {
  /** Creates the run record (status "queued") and returns its id. */
  createRun: (userId?: string) => Promise<string>;
  markRunning: (runId: string) => Promise<void>;
  /**
   * Ties the run to its technology once it is known. "already_running" means another generation
   * of the same technology is active (only one is allowed, FR-GEN-12).
   */
  setTechnology: (
    runId: string,
    technologyId: string,
  ) => Promise<"ok" | "already_running">;
  markWaiting: (runId: string, budget: Budget | null) => Promise<void>;
  markCompleted: (runId: string, budget: Budget | null) => Promise<void>;
  markFailed: (
    runId: string,
    reason: string,
    budget: Budget | null,
  ) => Promise<void>;
  /** Does this technology already have a guide? A failed run must not overwrite one. */
  hasGuide: (technologyId: string) => Promise<boolean>;
};

export type GenerateGraph = ReturnType<typeof buildGenerateGraph>;

/** What the runner needs from the outside. Tests pass fakes here. */
export type RunDeps = {
  store: RunStore;
  graph: GenerateGraph;
  /** Only what the runner itself uses: the progress feed and saving a partial guide. */
  generate: Pick<GenerateDeps, "events" | "saveGuide" | "indexGuide">;
  /** Called with the name of each graph step as it finishes (for progress lines). */
  onStep?: (node: string) => void;
};
