import { judge } from "./judge";
import type { Asked, ChatQuestion } from "./types";

// The chat evals in LangSmith's terms. Pure: no network, so it is tested like the rest.
//
//   questions.jsonl line  --toExample-->  a dataset example  { inputs, outputs, metadata }
//   a run's output (Asked) + its example  --scoreRun-->  [{ key: "origin_ok", score: 1 }, ...]
//
// The scoring is the same judge() the markdown report uses, so both reports agree.

export type ExampleFields = {
  inputs: { technology: string; question: string };
  outputs: { expected: string[]; mentions: string[] };
  metadata: { id: string; group: string };
};

export function toExample(q: ChatQuestion): ExampleFields {
  return {
    inputs: { technology: q.technology, question: q.question },
    outputs: { expected: q.expected, mentions: q.mentions ?? [] },
    metadata: { id: q.id, group: q.group },
  };
}

/** Rebuilds the question from a dataset example, so judge() can score it. */
export function fromExample(example: {
  inputs: Record<string, unknown>;
  outputs?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}): ChatQuestion {
  const mentions = (example.outputs?.mentions as string[] | undefined) ?? [];
  return {
    id: String(example.metadata?.id ?? ""),
    technology: String(example.inputs.technology),
    group: example.metadata?.group as ChatQuestion["group"],
    question: String(example.inputs.question),
    expected: (example.outputs?.expected ?? []) as ChatQuestion["expected"],
    mentions: mentions.length > 0 ? mentions : undefined,
  };
}

export type Score = { key: string; score: number | null; comment?: string };

const mark = (value: boolean | null) => (value === null ? null : +value);

/** One run's scores. A check that does not apply to the question scores null (left out). */
export function scoreRun(question: ChatQuestion, asked: Asked): Score[] {
  const j = judge(question, asked);
  const refused = asked.origin === "not_found";
  return [
    { key: "pass", score: mark(j.pass) },
    {
      key: "origin_ok",
      score: mark(j.originOk),
      comment: `expected ${question.expected.join(" or ")}, got ${asked.origin}`,
    },
    { key: "cited", score: mark(j.citedOk) },
    { key: "mentions", score: mark(j.mentionsOk) },
    {
      // answering a question that should be refused is the dangerous mistake
      key: "no_invention",
      score: question.group === "not_found" && !asked.error ? +refused : null,
    },
    {
      // a stored-text question that still went outside: slow, and a sign the grader is shaky
      key: "stored_stays_stored",
      score:
        question.group === "stored"
          ? +!Object.values(asked.calls).some((n) => n > 0)
          : null,
    },
    { key: "no_error", score: +!asked.error },
  ];
}
