import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { summarize } from "./metrics";
import { METHODS, type MethodName, type QuestionResult } from "./types";

// Turns the per-question results into the comparison table (Markdown) and saves it with the raw
// results (JSON) in evals/results/.
//
//   | Method        | Hit@5 | MRR   |
//   | hybrid+rerank | 90.5% | 0.812 |

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const ranksOf = (results: QuestionResult[], method: MethodName) =>
  results.map((result) => result.methods[method].rank);

export function buildReport(results: QuestionResult[], date: string): string {
  const technologies = [...new Set(results.map((r) => r.question.technology))];

  const overall = METHODS.map((method) => {
    const { hitAt5, mrr } = summarize(ranksOf(results, method));
    return `| ${method} | ${pct(hitAt5)} | ${mrr.toFixed(3)} |`;
  });

  const perTechnology = METHODS.map((method) => {
    const cells = technologies.map((technology) => {
      const mine = results.filter((r) => r.question.technology === technology);
      return pct(summarize(ranksOf(mine, method)).hitAt5);
    });
    return `| ${method} | ${cells.join(" | ")} |`;
  });

  const misses = results
    .filter((r) => (r.methods["hybrid+rerank"].rank ?? 99) > 5)
    .map((r) => {
      const found = r.methods["hybrid+rerank"].top5[0] ?? "nothing";
      return `- **${r.question.id}** ${r.question.question}\n  expected ${r.question.expectedUrls.join(" or ")}; top result: ${found}`;
    });

  return [
    `# Retrieval evals`,
    ``,
    `Run on ${date}: ${results.length} questions. Hit@5 = a correct page is in the top 5 chunks. MRR = average of 1 / position of the first correct chunk.`,
    ``,
    `| Method | Hit@5 | MRR |`,
    `| --- | --- | --- |`,
    ...overall,
    ``,
    `## Hit@5 by technology`,
    ``,
    `| Method | ${technologies.join(" | ")} |`,
    `| --- | ${technologies.map(() => "---").join(" | ")} |`,
    ...perTechnology,
    ``,
    `## Missed by hybrid + rerank (${misses.length})`,
    ``,
    ...(misses.length > 0 ? misses : ["None."]),
    ``,
  ].join("\n");
}

export function saveReport(
  results: QuestionResult[],
  report: string,
  folder: string,
): void {
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "retrieval.md"), report);
  writeFileSync(
    join(folder, "retrieval.json"),
    `${JSON.stringify(results, null, 2)}\n`,
  );
}
