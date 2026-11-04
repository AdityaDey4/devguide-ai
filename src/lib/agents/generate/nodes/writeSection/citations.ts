import type { SectionDraft } from "../../state";
import type { Material } from "./input";

// Which sources did the writer actually cite? Reads the [n] markers in the text.
//
//   readCitations("Use z.string() [1]. It also parses [2][1].", material)
//     -> { citations: [{ n: 1, url, title }, { n: 2, url, title }], unknown: [] }
//
// Markers inside code (`a[0]`, a fenced block) are not citations. A marker with no matching
// source (say [7] when there are 3) is reported in `unknown` for the checker.

const FENCED_CODE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
const INLINE_CODE = /`[^`\n]*`/g;
const MARKER = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

/** The source numbers cited in a piece of text, ignoring anything inside code. */
export function markersIn(text: string): number[] {
  const prose = text.replace(FENCED_CODE, "").replace(INLINE_CODE, "");
  const used = new Set<number>();
  for (const [, list] of prose.matchAll(MARKER)) {
    for (const n of list.split(",")) used.add(Number(n));
  }
  return [...used].sort((a, b) => a - b);
}

export function readCitations(
  markdown: string,
  material: Material[],
): { citations: SectionDraft["citations"]; unknown: number[] } {
  const byNumber = new Map(material.map((m) => [m.n, m]));
  const numbers = markersIn(markdown);
  return {
    citations: numbers
      .filter((n) => byNumber.has(n))
      .map((n) => ({
        n,
        url: byNumber.get(n)!.url,
        title: byNumber.get(n)!.title,
      })),
    unknown: numbers.filter((n) => !byNumber.has(n)),
  };
}
