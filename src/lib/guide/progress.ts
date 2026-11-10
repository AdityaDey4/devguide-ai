// What the progress view shows, built from the run's events (SRS FR-GEN-9, FR-GEN-10).
// Pure: the page keeps the result in state and feeds every new batch of events through it.
//
//   foldEvents(start, [
//     { id: 1, type: "identified", payload: { name: "Hono", version: "4.0" } },
//     { id: 2, type: "docs_found", payload: { count: 17 } },
//   ])
//   -> { name: "Hono", version: "4.0", pages: 17, ..., lastId: 2 }
//
// Because events are saved with increasing ids, a reloaded page just starts from nothing and
// replays all of them (or only those after `lastId`) and ends up in the same place.

export type EventRow = {
  id: number;
  type: string;
  payload: Record<string, unknown> | null;
};

export type SectionProgress = {
  key: string;
  title: string;
  status: "waiting" | "writing" | "done";
  /** The text so far; shown once the section is done. */
  text: string;
};

export type Progress = {
  name: string | null;
  version: string | null;
  pages: number | null;
  sections: SectionProgress[];
  checking: boolean;
  lastId: number;
};

export const emptyProgress: Progress = {
  name: null,
  version: null,
  pages: null,
  sections: [],
  checking: false,
  lastId: 0,
};

export function foldEvents(start: Progress, events: EventRow[]): Progress {
  let progress = start;
  for (const event of events) progress = foldOne(progress, event);
  return progress;
}

function foldOne(progress: Progress, event: EventRow): Progress {
  const data = event.payload ?? {};
  const next = { ...progress, lastId: Math.max(progress.lastId, event.id) };

  switch (event.type) {
    case "identified":
      return {
        ...next,
        name: text(data.name),
        version: text(data.version),
      };
    case "docs_found":
      return {
        ...next,
        pages: typeof data.count === "number" ? data.count : null,
      };
    case "outline":
      return {
        ...next,
        sections: asArray(data.sections).map((item) => ({
          key: text(item.key) ?? "",
          title: text(item.title) ?? "",
          status: "waiting" as const,
          text: "",
        })),
      };
    case "section_started":
      // A rewrite starts the section again: its text begins from nothing.
      return changeSection(next, text(data.key), (section) => ({
        ...section,
        status: "writing",
        text: "",
      }));
    case "section_delta":
      return changeSection(next, text(data.key), (section) => ({
        ...section,
        text: section.text + (text(data.text) ?? ""),
      }));
    case "section_done":
      return changeSection(next, text(data.key), (section) => ({
        ...section,
        status: "done",
      }));
    case "checking":
      return { ...next, checking: true };
    default:
      return next; // needs_choice, completed, failed: the run's status says it all
  }
}

function changeSection(
  progress: Progress,
  key: string | null,
  change: (section: SectionProgress) => SectionProgress,
): Progress {
  if (!key) return progress;
  return {
    ...progress,
    sections: progress.sections.map((section) =>
      section.key === key ? change(section) : section,
    ),
  };
}

const text = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const asArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null,
      )
    : [];
