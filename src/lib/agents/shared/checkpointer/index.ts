import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { Pool } from "pg";
import {
  CHECKPOINT_SCHEMA,
  POOL_SIZE,
  RECURSION_LIMIT,
  readConnectionString,
} from "./config";
import type { CheckpointerDeps } from "./types";

export { CheckpointerError } from "./errors";

// Saves a graph's state after every step, so a run that was killed can carry on where it
// stopped instead of starting again (SRS FR-GEN-1, Definition of Done of M3).
//
//   const checkpointer = await getCheckpointer();
//   const graph = builder.compile({ checkpointer });
//   await graph.invoke(input, runConfig(runId));        // first start
//   await graph.invoke(null, runConfig(runId));         // after a crash: continues from the last step
//
// `runConfig(runId)` sets LangGraph's thread id to the run id (docs/03-Architecture.md section 5),
// which is how a run finds its own checkpoints.
// The tables live in the `langgraph` schema, created on first use; the setup is repeatable and
// only applies steps that are missing. One connection pool is shared by the whole process.
// Server only: it connects straight to Postgres with DATABASE_URL.

const realDeps: CheckpointerDeps = {
  connectionString: readConnectionString,
  create: (connectionString) =>
    new PostgresSaver(
      new Pool({ connectionString, max: POOL_SIZE }),
      undefined,
      { schema: CHECKPOINT_SCHEMA },
    ),
};

/** The one checkpointer of this process, kept once it is ready. Cleared when setup fails. */
let ready: Promise<PostgresSaver> | undefined;

export function getCheckpointer(
  deps: CheckpointerDeps = realDeps,
): Promise<PostgresSaver> {
  ready ??= open(deps).catch((error) => {
    ready = undefined; // a later call tries again
    throw error;
  });
  return ready;
}

async function open(deps: CheckpointerDeps): Promise<PostgresSaver> {
  const saver = deps.create(deps.connectionString());
  try {
    await saver.setup(); // creates the schema and tables, or does nothing if they exist
  } catch (error) {
    await saver.end();
    throw error;
  }
  return saver;
}

/** Closes the connections. Scripts and tests call this at the end so the process can exit. */
export async function closeCheckpointer(): Promise<void> {
  const pending = ready;
  ready = undefined;
  if (pending) await (await pending).end();
}

/**
 * The config to pass to `graph.invoke(...)`: this run's checkpoints are the thread `runId`.
 *
 * `durability: "sync"` saves each step's checkpoint BEFORE the next step starts. LangGraph's
 * default ("async") saves it in the background while the next step runs, so a process killed at
 * that moment can lose the step before. A step here is an LLM call of seconds, so the extra write
 * costs nothing noticeable, and without it a killed run cannot be resumed reliably.
 */
export function runConfig(runId: string) {
  return {
    configurable: { thread_id: runId },
    durability: "sync" as const,
    recursionLimit: RECURSION_LIMIT,
  };
}
