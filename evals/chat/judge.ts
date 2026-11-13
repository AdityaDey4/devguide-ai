import type { Asked, ChatQuestion, Judged } from "./types";

// Decides whether one answer is right, and adds the answers up. Pure: no model, no database.
//
//   judge(question, asked) -> { originOk, mentionsOk, citedOk, pass }
//
// An answer passes when ALL of these hold:
//   - it did not fail with an error
//   - its origin is one the question expects
//   - if it should answer: it cites at least one source, and uses one of the expected words
//   - if it should be refused: it says so, with no citations

export function judge(question: ChatQuestion, asked: Asked): Judged {
  const refusal = question.expected.every((origin) => origin === "not_found");
  const originOk = !asked.error && question.expected.includes(asked.origin);

  const mentionsOk =
    refusal || !question.mentions
      ? null
      : question.mentions.some((word) =>
          asked.reply.toLowerCase().includes(word.toLowerCase()),
        );
  const citedOk = refusal ? null : asked.cited.length > 0;

  return {
    question,
    asked,
    originOk,
    mentionsOk,
    citedOk,
    pass: originOk && mentionsOk !== false && citedOk !== false,
  };
}

export type Summary = {
  total: number;
  passed: number;
  originRight: number;
  byGroup: Record<string, { total: number; originRight: number }>;
  /** Questions that should have been answered but were refused. */
  falseRefusals: number;
  /** Questions that should have been refused but were answered (the dangerous kind). */
  invented: number;
  /** Stored-text questions that still went outside: wasted time, and a sign the grader is shaky. */
  needlesslyOutside: number;
  /** Answered questions that used an expected word, and how many were checked. */
  mentions: { ok: number; checked: number };
  errors: number;
  firstTokenMs: { p50: number; p90: number };
  totalMs: { p50: number; p90: number };
};

export function summarise(judged: Judged[]): Summary {
  const byGroup: Summary["byGroup"] = {};
  for (const j of judged) {
    const group = (byGroup[j.question.group] ??= { total: 0, originRight: 0 });
    group.total++;
    if (j.originOk) group.originRight++;
  }

  const wasRefused = (j: Judged) => j.asked.origin === "not_found";
  const shouldRefuse = (j: Judged) => j.question.group === "not_found";
  const checked = judged.filter((j) => j.mentionsOk !== null);

  return {
    total: judged.length,
    passed: judged.filter((j) => j.pass).length,
    originRight: judged.filter((j) => j.originOk).length,
    byGroup,
    falseRefusals: judged.filter(
      (j) => !shouldRefuse(j) && !j.asked.error && wasRefused(j),
    ).length,
    invented: judged.filter(
      (j) => shouldRefuse(j) && !j.asked.error && !wasRefused(j),
    ).length,
    needlesslyOutside: judged.filter(
      (j) =>
        j.question.group === "stored" &&
        Object.values(j.asked.calls).some((n) => n > 0),
    ).length,
    mentions: {
      ok: checked.filter((j) => j.mentionsOk).length,
      checked: checked.length,
    },
    errors: judged.filter((j) => j.asked.error).length,
    firstTokenMs: percentiles(judged.map((j) => j.asked.firstTokenMs)),
    totalMs: percentiles(judged.map((j) => j.asked.totalMs)),
  };
}

/** The median and the 90th percentile (nearest rank), 0 for an empty list. */
export function percentiles(values: number[]): { p50: number; p90: number } {
  if (values.length === 0) return { p50: 0, p90: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
  return { p50: at(0.5), p90: at(0.9) };
}
