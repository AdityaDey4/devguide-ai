import { markersIn } from "../writeSection/citations";

// Finds the explanatory paragraphs that cite no source (FR-GEN-6: every factual paragraph does).
//
//   findUncited("Zod parses data [1].\n\nIt is also very fast and tiny in size.", new Set([1]))
//     -> ["It is also very fast and tiny in size."]
//
// Not checked: code blocks, headings, and short lead-in lines ("Install it with:"), which state
// no fact worth a citation. A paragraph that only cites a number that does not exist is uncited.

const FENCED_CODE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
const SHORTEST_CHECKED = 60;
const SNIPPET = 70;

export function findUncited(
  markdown: string,
  validNumbers: Set<number>,
): string[] {
  return markdown
    .replace(FENCED_CODE, "\n\n")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(
      (block) => block.length >= SHORTEST_CHECKED && !block.startsWith("#"),
    )
    .filter((block) => !markersIn(block).some((n) => validNumbers.has(n)))
    .map((block) =>
      block.length > SNIPPET ? `${block.slice(0, SNIPPET - 1)}…` : block,
    );
}
