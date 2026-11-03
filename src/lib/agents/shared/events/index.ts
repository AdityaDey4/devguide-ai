import { DELTA_INTERVAL_MS } from "./config";
import { insertEvent } from "./database";
import { toRow } from "./row";
import type { EventRow, EventsDeps, RunEvent } from "./types";

export type { EventRow, EventsDeps, RunEvent, RunEventType } from "./types";

// How a running graph tells the UI what it is doing (SRS FR-GEN-9, FR-GEN-10).
//
//   const events = new RunEvents(runId);
//   await events.emit({ type: "docs_found", count: 31 });            // one row in run_events
//   await events.emit({ type: "section_started", key: "setup", title: "Setup" });
//   for await (const token of stream) events.delta("setup", token); // gathered, ~1 row / 300 ms
//   await events.emit({ type: "section_done", key: "setup", citations: 4 });
//
// Rules this class keeps:
//  - Order: rows are saved one after another, and every `emit` first saves the text that is
//    still waiting, so "section_done" never overtakes the last words of its section.
//  - Batching: `delta` saves at most one row per section every 300 ms. No timer: it checks the
//    clock when text arrives, and the leftover is saved by the next `emit` or by `flush`.
//  - Failure: a row that cannot be saved is reported through `onError` and the run goes on
//    (the run continues server-side even if progress cannot be shown).
// A graph creates one RunEvents per run. Server only: it writes with the service role.

const realDeps: EventsDeps = {
  insert: insertEvent,
  now: Date.now,
  onError: (error, row) =>
    console.error(`run_events: ${row.type} not saved:`, error),
};

export class RunEvents {
  /** Text waiting to be saved, by section key. */
  private pending = new Map<string, string>();
  /** When each section's text was last saved. */
  private lastSaved = new Map<string, number>();
  /** The last write, so the next one starts after it finishes. */
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly runId: string,
    private readonly deps: EventsDeps = realDeps,
  ) {}

  /** Saves any waiting text, then this event. Resolves when both are saved. Never throws. */
  async emit(event: RunEvent): Promise<void> {
    this.flushDeltas();
    return this.save(toRow(this.runId, event));
  }

  /** Adds streamed text of a section. Saves a row only when 300 ms have passed since the last one. */
  async delta(key: string, text: string): Promise<void> {
    this.pending.set(key, (this.pending.get(key) ?? "") + text);
    const now = this.deps.now();
    const last = this.lastSaved.get(key) ?? -Infinity;
    if (now - last >= DELTA_INTERVAL_MS) return this.flushDeltas(key);
  }

  /** Saves all waiting text now. Call at the end of a stream and before the run finishes. */
  async flush(): Promise<void> {
    this.flushDeltas();
    await this.tail;
  }

  private flushDeltas(onlyKey?: string): Promise<void> {
    for (const [key, text] of this.pending) {
      if (onlyKey !== undefined && key !== onlyKey) continue;
      this.pending.delete(key);
      this.lastSaved.set(key, this.deps.now());
      this.save(toRow(this.runId, { type: "section_delta", key, text }));
    }
    return this.tail;
  }

  private save(row: EventRow): Promise<void> {
    this.tail = this.tail
      .then(() => this.deps.insert(row))
      .catch((error) => this.deps.onError(error, row));
    return this.tail;
  }
}
