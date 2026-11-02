import {
  FENCE_TOKENS,
  JOIN_TOKENS,
  MAX_CODE_TOKENS,
  MAX_TOKENS,
} from "./config";
import { splitByBudget } from "./text";
import { countTokens } from "./tokens";
import type { Unit } from "./types";

// STEP 3: split the units that are too big for one chunk.
//
//   a unit of 500 tokens                         -> unchanged
//   a code block of 1,500 tokens (up to 2,000)   -> unchanged: code is kept whole
//   a code block of 3,000 tokens                 -> several pieces, each its own ```fenced``` block
//   a giant paragraph, list or table             -> several pieces (a table repeats its header row)

export function splitLarge(units: Unit[]): Unit[] {
  return units.flatMap((unit) => {
    if (unit.tokens <= MAX_TOKENS) return [unit];
    if (unit.code !== undefined) {
      return unit.tokens <= MAX_CODE_TOKENS
        ? [unit]
        : splitCodeUnit(unit, unit.code);
    }
    return splitTextUnit(unit);
  });
}

/** A unit with no code: headings plus one long block of text. */
function splitTextUnit(unit: Unit): Unit[] {
  // The headings stay with the first piece. The last part is the long block itself.
  const parts = unit.lead.split("\n\n");
  const body = parts.pop() ?? "";
  const headings = parts.join("\n\n");
  const headingTokens = headings ? countTokens(headings) + JOIN_TOKENS : 0;

  return splitByBudget(body, MAX_TOKENS - headingTokens).map((piece, i) => {
    const text = i === 0 && headings ? `${headings}\n\n${piece}` : piece;
    return piece$(text, unit, i);
  });
}

/** A code block over MAX_CODE_TOKENS: cut at blank lines (between functions), re-fence each piece. */
function splitCodeUnit(unit: Unit, code: string): Unit[] {
  const lines = code.split("\n");
  const open = lines[0];
  const close = lines[lines.length - 1];
  const body = lines.slice(1, -1).join("\n");

  const leadTokens = unit.lead ? countTokens(unit.lead) + JOIN_TOKENS : 0;
  const budget = MAX_TOKENS - FENCE_TOKENS;

  return splitCode(body, budget - leadTokens, budget).map((piece, i) => {
    const block = `${open}\n${piece}\n${close}`;
    const text = i === 0 && unit.lead ? `${unit.lead}\n\n${block}` : block;
    return {
      ...piece$(text, unit, i),
      lead: i === 0 ? unit.lead : "",
      code: block,
    };
  });
}

/** Groups of lines separated by blank lines are kept together when they fit. */
function splitCode(
  body: string,
  firstBudget: number,
  budget: number,
): string[] {
  const pieces: string[] = [];
  let current: string[] = [];
  let used = 0;
  let limit = firstBudget;

  const flush = () => {
    if (current.length === 0) return;
    pieces.push(current.join("\n\n"));
    current = [];
    used = 0;
    limit = budget;
  };

  for (const segment of body.split(/\n\s*\n/)) {
    const parts =
      countTokens(segment) > limit ? splitByBudget(segment, limit) : [segment];
    for (const part of parts) {
      const cost = countTokens(part) + JOIN_TOKENS;
      if (used + cost > limit && current.length > 0) flush();
      current.push(part);
      used += cost;
    }
  }
  flush();
  return pieces;
}

/** A piece of `unit`: same place in the page, and only the first piece starts a section. */
function piece$(text: string, unit: Unit, index: number): Unit {
  return {
    text,
    lead: text,
    tokens: countTokens(text),
    path: unit.path,
    majorStart: index === 0 && unit.majorStart,
  };
}
