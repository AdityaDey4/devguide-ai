import type { EventRow, RunEvent } from "./types";

// Splits an event into the `run_events` columns.
//
//   toRow("run-1", { type: "docs_found", count: 31 })
//     -> { run_id: "run-1", type: "docs_found", payload: { count: 31 } }

export function toRow(runId: string, event: RunEvent): EventRow {
  const { type, ...payload } = event;
  return { run_id: runId, type, payload };
}
