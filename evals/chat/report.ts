import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { summarise } from "./judge";
import type { Judged } from "./types";

// Turns the judged answers into a Markdown report and saves it with the raw results (JSON) in
// evals/results/.

const pct = (part: number, whole: number) =>
  whole === 0
    ? "n/a"
    : `${((part / whole) * 100).toFixed(0)}% (${part}/${whole})`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const oneLine = (text: string, max: number) =>
  text.replace(/\s+/g, " ").trim().slice(0, max);

export function buildChatReport(judged: Judged[], date: string): string {
  const s = summarise(judged);
  const groups = [
    ["stored", "Answered from stored text"],
    ["outside", "Needed the outside lookup"],
    ["not_found", "Should be refused"],
  ] as const;

  const rows = judged.map((j) => {
    const calls = Object.values(j.asked.calls).reduce((a, b) => a + b, 0);
    return `| ${j.question.id} | ${j.question.expected.join(" / ")} | ${j.asked.error ? "ERROR" : j.asked.origin} | ${j.asked.grade ?? "-"} | ${calls} | ${j.asked.cited.length} | ${seconds(j.asked.totalMs)} | ${j.pass ? "pass" : "**FAIL**"} |`;
  });

  const failures = judged
    .filter((j) => !j.pass)
    .map((j) => {
      const why = [
        j.asked.error && `error: ${j.asked.error}`,
        !j.originOk &&
          !j.asked.error &&
          `origin ${j.asked.origin}, expected ${j.question.expected.join(" or ")}`,
        j.mentionsOk === false &&
          `none of [${j.question.mentions?.join(", ")}] in the answer`,
        j.citedOk === false && "no citations",
      ].filter(Boolean);
      return [
        `- **${j.question.id}** (${j.question.technology}) ${j.question.question}`,
        `  - ${why.join("; ")}`,
        `  - answer: ${oneLine(j.asked.reply, 260) || "(none)"}`,
        `  - cited: ${j.asked.cited.length > 0 ? j.asked.cited.join("; ") : "nothing"}`,
      ].join("\n");
    });

  return [
    `# Chat evals`,
    ``,
    `Run on ${date}: ${s.total} questions through the real graph (real models, Context7 and web). Nothing fetched is saved while running. "Mentions" is a keyword check, not a judge of correctness.`,
    ``,
    `| Measure | Result |`,
    `| --- | --- |`,
    `| Passed (right origin, cited, uses an expected word) | ${pct(s.passed, s.total)} |`,
    `| Origin as expected | ${pct(s.originRight, s.total)} |`,
    ...groups.map(
      ([key, label]) =>
        `| - ${label} | ${pct(s.byGroup[key]?.originRight ?? 0, s.byGroup[key]?.total ?? 0)} |`,
    ),
    `| **Invented answers** (should be refused, was answered) | ${s.invented} of ${s.byGroup.not_found?.total ?? 0} |`,
    `| False refusals (answerable, but refused) | ${s.falseRefusals} of ${s.total - (s.byGroup.not_found?.total ?? 0)} |`,
    `| Stored-text questions that still went outside | ${s.needlesslyOutside} of ${s.byGroup.stored?.total ?? 0} |`,
    `| Answers using an expected word | ${pct(s.mentions.ok, s.mentions.checked)} |`,
    `| Errors | ${s.errors} |`,
    `| First text after (median / 90th percentile) | ${seconds(s.firstTokenMs.p50)} / ${seconds(s.firstTokenMs.p90)} |`,
    `| Whole answer (median / 90th percentile) | ${seconds(s.totalMs.p50)} / ${seconds(s.totalMs.p90)} |`,
    ``,
    `## Every question`,
    ``,
    `| Id | Expected | Got | Grade | Outside calls | Cited | Time | |`,
    `| --- | --- | --- | --- | --- | --- | --- | --- |`,
    ...rows,
    ``,
    `## Needs a look (${failures.length})`,
    ``,
    ...(failures.length > 0 ? failures : ["None."]),
    ``,
  ].join("\n");
}

export function saveChatReport(
  judged: Judged[],
  report: string,
  folder: string,
): void {
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "chat.md"), report);
  writeFileSync(
    join(folder, "chat.json"),
    `${JSON.stringify(judged, null, 2)}\n`,
  );
}
