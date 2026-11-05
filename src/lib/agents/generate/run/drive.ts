import { runConfig } from "../../shared/checkpointer";
import type { Budget } from "../../shared/budget";
import type { GenerateStateType } from "../state";
import { describeFailure, RunConflict } from "./failure";
import { savePartial } from "./partial";
import type { RunDeps, RunOutcome } from "./types";

// Runs the graph for one run id until it finishes, needs an answer, or fails, and keeps the run
// record in step with it. `input` is the starting values, a Command with the person's answer, or
// null to continue from the last checkpoint.
//
//   running ──► completed
//           ├─► waiting_user   (the name was ambiguous: stop here, answer later)
//           └─► failed         (a failed event with the reason, a partial draft if there is one)
//
// It never throws: every ending is a RunOutcome.

export async function drive(
  runId: string,
  input: unknown,
  deps: RunDeps,
): Promise<RunOutcome> {
  const config = runConfig(runId);
  try {
    await deps.store.markRunning(runId);

    const updates = await deps.graph.stream(input as never, {
      ...config,
      streamMode: "updates",
    });
    for await (const update of updates) {
      for (const [node, change] of Object.entries(update)) {
        if (node.startsWith("__")) continue; // LangGraph's own markers, e.g. the pause
        deps.onStep?.(node);
        if (node === "identify") await claimTechnology(runId, change, deps);
      }
    }
    return await finish(runId, deps);
  } catch (error) {
    return await fail(runId, error, deps);
  }
}

/** Once identify knows the technology, the run is tied to it (one active run per technology). */
async function claimTechnology(
  runId: string,
  change: unknown,
  deps: RunDeps,
): Promise<void> {
  const technology = (change as { technology?: { id: string; name: string } })
    ?.technology;
  if (!technology?.id) return;
  const claimed = await deps.store.setTechnology(runId, technology.id);
  if (claimed === "already_running") throw new RunConflict(technology.name);
}

/** The graph stopped without an error: it is either waiting for an answer or done. */
async function finish(runId: string, deps: RunDeps): Promise<RunOutcome> {
  const snapshot = await deps.graph.getState(runConfig(runId));
  const values = snapshot.values as GenerateStateType;
  const budget: Budget | null = values.budget ?? null;

  const waiting = snapshot.tasks.some((task) => task.interrupts.length > 0);
  if (waiting) {
    await deps.store.markWaiting(runId, budget);
    return { status: "waiting_user", runId, candidates: values.candidates };
  }

  if (!values.guideId || !values.versionId) {
    throw new Error("The run ended without saving a guide");
  }
  await deps.store.markCompleted(runId, budget);
  return {
    status: "completed",
    runId,
    guideId: values.guideId,
    versionId: values.versionId,
  };
}

/** Records the failure. Each step is tried on its own so one problem cannot hide the reason. */
async function fail(
  runId: string,
  error: unknown,
  deps: RunDeps,
): Promise<RunOutcome> {
  const reason = describeFailure(error);

  let values: GenerateStateType | null = null;
  try {
    values = (await deps.graph.getState(runConfig(runId)))
      .values as GenerateStateType;
  } catch {
    // no checkpoint yet (it failed on the first step)
  }

  await attempt(() =>
    deps.generate.events(runId).emit({ type: "failed", reason }),
  );
  if (values) await attempt(() => savePartial(values, deps));
  await attempt(() =>
    deps.store.markFailed(runId, reason, values?.budget ?? null),
  );
  return { status: "failed", runId, reason };
}

async function attempt(work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    console.error("run bookkeeping failed:", describeFailure(error));
  }
}
