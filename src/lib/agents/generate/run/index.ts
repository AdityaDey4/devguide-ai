import { createServiceClient } from "../../../supabase/service";
import { getCheckpointer } from "../../shared/checkpointer";
import { buildGenerateGraph } from "../graph";
import { realDeps } from "../realDeps";
import { Command } from "@langchain/langgraph";
import { drive } from "./drive";
import { SupabaseRunStore } from "./store";
import type { RunDeps, RunOutcome } from "./types";

export { describeFailure, RunConflict } from "./failure";
export { SupabaseRunStore } from "./store";
export type { RunDeps, RunOutcome, RunStore } from "./types";

// Runs a guide generation from start to finish (SRS FR-GEN-1, section 7). Used by the command
// line now and by the web page in M4.
//
//   const outcome = await startGeneration("zod");
//   outcome -> { status: "completed", runId, guideId, versionId }
//           |  { status: "waiting_user", runId, candidates }   the name was ambiguous
//           |  { status: "failed", runId, reason }
//
//   // the person picked one:
//   await resumeGeneration(runId, { choice: "candidate", url: candidates[0].url });
//
//   // the process was killed in the middle of a run: carry on from the last saved step
//   await resumeGeneration(runId);
//
// Every ending is a value, never an exception. Server only.

export type RunOptions = {
  userId?: string;
  /** Called with the name of each graph step as it finishes (for progress lines). */
  onStep?: (node: string) => void;
};

export async function startGeneration(
  query: string,
  options: RunOptions = {},
  deps?: RunDeps,
): Promise<RunOutcome> {
  const run = deps ?? (await realRunDeps(options.onStep));
  const runId = await run.store.createRun(options.userId);
  return drive(runId, { runId, query }, run);
}

/** Answers a waiting run, or (without an answer) continues one that was interrupted. */
export async function resumeGeneration(
  runId: string,
  answer?: unknown,
  options: RunOptions = {},
  deps?: RunDeps,
): Promise<RunOutcome> {
  const run = deps ?? (await realRunDeps(options.onStep));
  return drive(
    runId,
    answer === undefined ? null : new Command({ resume: answer }),
    run,
  );
}

async function realRunDeps(onStep?: RunOptions["onStep"]): Promise<RunDeps> {
  return {
    store: new SupabaseRunStore(createServiceClient()),
    graph: buildGenerateGraph(await getCheckpointer(), realDeps),
    generate: realDeps,
    onStep,
  };
}
