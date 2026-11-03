// Progress events: what the UI shows while a guide is being written (SRS FR-GEN-9).
// Each one becomes a row in `run_events`: `type` is the column of the same name and the rest is
// the `payload` JSON the browser reads.

export type RunEvent =
  | {
      type: "identified";
      name: string;
      version?: string;
      officialUrl: string;
      docsUrl: string;
    }
  | { type: "docs_found"; count: number }
  | { type: "outline"; sections: { key: string; title: string }[] }
  | { type: "section_started"; key: string; title: string }
  // Several tokens of one section, gathered over about 300 ms.
  | { type: "section_delta"; key: string; text: string }
  | { type: "section_done"; key: string; citations: number }
  | { type: "checking"; keys: string[] }
  | { type: "completed"; guideId: string; versionId: string }
  | { type: "failed"; reason: string };

export type RunEventType = RunEvent["type"];

/** One row to insert into `run_events`. */
export type EventRow = {
  run_id: string;
  type: RunEventType;
  payload: Record<string, unknown>;
};

/** What the emitter needs from the outside. Tests pass fakes here. */
export type EventsDeps = {
  insert: (row: EventRow) => Promise<void>;
  now: () => number;
  /** A progress event could not be saved. The run goes on. */
  onError: (error: unknown, row: EventRow) => void;
};
