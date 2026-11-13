import type { Ranked } from "../../rag/reranker";

// The numbered excerpts a model reads: the answer step to write from, the grader to judge. Both
// see the same text under the same numbers, so "[2]" means the same excerpt to both.
//
//   formatExcerpts([chunk])
//     -> "=== EXCERPT [1]: API > Strings - https://zod.dev/api ===\nUse z.url() ...\n=== END EXCERPT [1] ==="
//
// A chunk of the guide's own text has no page: it is shown as "this guide".

export function formatExcerpts(chunks: Ranked[]): string {
  return chunks
    .map((chunk, i) => {
      const where = chunk.sourceUrl ?? "this guide";
      const title = chunk.headingPath ? `${chunk.headingPath} - ` : "";
      return `=== EXCERPT [${i + 1}]: ${title}${where} ===\n${chunk.content}\n=== END EXCERPT [${i + 1}] ===`;
    })
    .join("\n\n");
}
