import {
  JOIN_TOKENS,
  MAX_TOKENS,
  MERGE_MAX_TOKENS,
  MIN_TOKENS,
  OVERLAP_TOKENS,
} from "./config";
import { commonPath, formatPath } from "./headingPath";
import { tailWithin } from "./text";
import { countTokens } from "./tokens";
import type { Chunk, Unit } from "./types";

// STEP 4: fill chunks with units, in order.
//
// A chunk is closed when:
//   - the next unit would not fit (more than 800 tokens)       -> the cut is forced by size
//   - the chunk has 500+ tokens and the next unit starts a new
//     top-level section (# or ##)                              -> a natural end, no overlap needed
//
// After a size-forced cut, the new chunk starts with ~100 tokens repeated from the end of the
// previous one, so an idea that straddles the cut is found in both.

export function pack(units: Unit[]): Chunk[] {
  const chunks: Chunk[] = [];
  let current: Unit[] = [];
  let used = 0;

  const close = () => {
    const chunk = toChunk(current);
    if (chunk) chunks.push(chunk);
  };

  for (const unit of units) {
    if (current.length > 0) {
      const total = used + JOIN_TOKENS + unit.tokens;
      // A small leftover joins the code block after it, rather than staying a tiny chunk.
      const joinsCode =
        unit.code !== undefined &&
        used < MIN_TOKENS &&
        total <= MERGE_MAX_TOKENS;
      const fits = total <= MAX_TOKENS || joinsCode;
      const sectionDone = unit.majorStart && used >= MIN_TOKENS;

      if (!fits || sectionDone) {
        const previous = current;
        close();

        const overlap = sectionDone ? undefined : overlapFrom(previous);
        const room = overlap
          ? overlap.tokens + JOIN_TOKENS + unit.tokens
          : Infinity;
        current = overlap && room <= MAX_TOKENS ? [overlap] : [];
        used = current.reduce((sum, u) => sum + u.tokens, 0);
      }
    }

    used += (current.length > 0 ? JOIN_TOKENS : 0) + unit.tokens;
    current.push(unit);
  }
  close();

  return chunks;
}

/** The tail of the last unit, as a unit of its own. Code is never repeated (it would be cut). */
function overlapFrom(units: Unit[]): Unit | undefined {
  const last = units[units.length - 1];
  if (!last || last.code !== undefined) return undefined;

  const tail = tailWithin(last.text, OVERLAP_TOKENS);
  if (!tail) return undefined;
  return {
    text: tail,
    lead: tail,
    tokens: countTokens(tail),
    path: last.path,
    majorStart: false,
    isOverlap: true,
  };
}

function toChunk(units: Unit[]): Chunk | null {
  // The overlap is not what the chunk is about, so it does not decide the heading path.
  const own = units.filter((unit) => !unit.isOverlap);
  if (own.length === 0) return null;

  const content = units
    .map((unit) => unit.text)
    .join("\n\n")
    .trim();
  if (!content) return null;

  return {
    content,
    headingPath: formatPath(commonPath(own.map((unit) => unit.path))),
    tokens: countTokens(content),
  };
}
