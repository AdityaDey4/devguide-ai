import { countTokens } from "./tokens";

// Helpers for cutting text by a token budget, used when something is too big for one chunk
// and when taking the repeated text for the overlap.

/**
 * Cuts text into pieces of at most `budget` tokens. Cuts at line breaks first, then at
 * sentences, then at words. A table's header row is repeated at the top of every piece.
 */
export function splitByBudget(text: string, budget: number): string[] {
  const lines = text.split("\n");
  const header = tableHeader(lines);
  const headerTokens =
    header.length > 0 ? countTokens(header.join("\n")) + 1 : 0;
  const room = budget - headerTokens;

  const pieces: string[] = [];
  let current: string[] = [];
  let used = 0;

  const flush = () => {
    if (current.length > 0) pieces.push([...header, ...current].join("\n"));
    current = [];
    used = 0;
  };

  for (const line of shrink(lines.slice(header.length), room)) {
    const cost = countTokens(line) + 1;
    if (used + cost > room && current.length > 0) flush();
    current.push(line);
    used += cost;
  }
  flush();
  return pieces.length > 0 ? pieces : [text];
}

/** The last lines or sentences of `text` that fit in `budget` tokens (for the overlap). */
export function tailWithin(text: string, budget: number): string {
  const lines = text.split("\n");
  const tail: string[] = [];
  let used = 0;

  for (let i = lines.length - 1; i >= 0; i--) {
    const cost = countTokens(lines[i]) + 1;
    if (used + cost <= budget) {
      tail.unshift(lines[i]);
      used += cost;
      continue;
    }
    // The last line alone is too long (a paragraph is one line): take its last sentences.
    if (tail.length === 0) {
      const sentences = lines[i].split(/(?<=[.!?])\s+/);
      const kept: string[] = [];
      let sentenceTokens = 0;
      for (let j = sentences.length - 1; j >= 0; j--) {
        const sentenceCost = countTokens(sentences[j]) + 1;
        if (sentenceTokens + sentenceCost > budget) break;
        kept.unshift(sentences[j]);
        sentenceTokens += sentenceCost;
      }
      if (kept.length > 0) tail.unshift(kept.join(" "));
    }
    break;
  }
  return tail.join("\n");
}

/** Lines that are too long for the budget become several shorter ones. */
function shrink(lines: string[], budget: number): string[] {
  return lines.flatMap((line) =>
    countTokens(line) + 1 <= budget ? [line] : splitLongLine(line, budget),
  );
}

function splitLongLine(line: string, budget: number): string[] {
  const parts = line
    .split(/(?<=[.!?])\s+/) // sentences
    .flatMap(
      (sentence) =>
        countTokens(sentence) + 1 <= budget
          ? [sentence]
          : sentence.split(/\s+/), // words
    );

  const out: string[] = [];
  let current = "";
  let used = 0;
  for (const part of parts) {
    const cost = countTokens(part) + 1;
    if (used + cost > budget && current) {
      out.push(current);
      current = "";
      used = 0;
    }
    current = current ? `${current} ${part}` : part;
    used += cost;
  }
  if (current) out.push(current);
  return out;
}

/** The first two lines of a Markdown table ("| a | b |" and "| --- | --- |"), if it is one. */
function tableHeader(lines: string[]): string[] {
  const isTable =
    lines.length > 2 &&
    /^\s*\|/.test(lines[0]) &&
    /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[1]) &&
    lines[1].includes("-");
  return isTable ? lines.slice(0, 2) : [];
}
