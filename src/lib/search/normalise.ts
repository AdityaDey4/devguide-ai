import { MAX_QUERY_CHARS, MIN_QUERY_CHARS } from "./config";

// Turns what the person typed into something safe to look up (SRS FR-SRCH-1).
//
//   normaliseQuery("  Next.JS  ")
//     -> { ok: true, display: "Next.JS", slugs: ["nextjs", "next-js"] }
//
//   `display`  trimmed, spaces collapsed: what the generation run searches the web for
//   `slugs`    the ids a technology with this name may have been saved under; the first one is
//              also what a new technology is called until its real slug is known
//
// Only letters, digits, spaces and . - _ + # survive (so "C#", "C++" and ".NET" work); anything
// else is dropped, which also keeps the text harmless wherever it goes next. Aliases (a name
// that maps to a different technology) are not handled yet.

export type Normalised =
  | { ok: true; display: string; slugs: string[] }
  | { ok: false; reason: "too_short" | "too_long" };

const UNSAFE = /[^\p{L}\p{N} ._+#-]/gu;
const SEPARATORS = /[\s._-]+/g;

export function normaliseQuery(raw: string): Normalised {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (collapsed.length > MAX_QUERY_CHARS)
    return { ok: false, reason: "too_long" };

  const display = collapsed.replace(UNSAFE, "").replace(/ +/g, " ").trim();
  if (display.length < MIN_QUERY_CHARS)
    return { ok: false, reason: "too_short" };

  const lower = display.toLowerCase();
  const slugs = [
    ...new Set([
      lower.replace(SEPARATORS, ""), // next.js -> nextjs
      lower.replace(SEPARATORS, "-"), // next js -> next-js
    ]),
  ].filter((slug) => slug.length > 0);
  return { ok: true, display, slugs };
}
