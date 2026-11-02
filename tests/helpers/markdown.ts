import { countTokens } from "@/lib/rag/chunker/tokens";

// Builds Markdown of a known size, and checks chunks. Used by the chunker and ingest tests.

const WORDS =
  "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango".split(
    " ",
  );

/** One sentence of about 20 tokens. */
export const sentence = (i: number) =>
  `Item ${i} says that ${WORDS[i % 20]} works with ${WORDS[(i * 7) % 20]} when ${WORDS[(i * 3) % 20]} is set.`;

/** A one-line paragraph of about `tokens` tokens. `tag` makes it unique and easy to find. */
export function paragraph(tokens: number, tag: string): string {
  const parts: string[] = [];
  for (let i = 0; countTokens(parts.join(" ")) < tokens; i++) {
    parts.push(`[${tag}] ${sentence(i)}`);
  }
  return parts.join(" ");
}

/** A fenced code block of about `tokens` tokens: functions separated by blank lines. */
export function codeBlock(tokens: number, tag: string, lang = "ts"): string {
  const functions: string[] = [];
  for (let i = 0; countTokens(functions.join("\n\n")) < tokens; i++) {
    functions.push(
      `function ${tag}${i}(a: number) {\n  // ${sentence(i)}\n  return a + ${i};\n}`,
    );
  }
  return "```" + lang + "\n" + functions.join("\n\n") + "\n```";
}

const FENCE_LINE = /^\s{0,3}(`{3,}|~{3,})/;

/** Number of lines that open or close a code fence. An even number means balanced. */
export const fenceLines = (text: string) =>
  text.split("\n").filter((line) => FENCE_LINE.test(line)).length;

export const lastLine = (text: string) =>
  text.trimEnd().split("\n").at(-1) ?? "";

type SizedChunk = { content: string; tokens: number };

/** Every chunk is at most 800 tokens, or holds one whole code block (up to 2,000 tokens). */
export const sizesAreValid = (chunks: SizedChunk[]) =>
  chunks.every(
    (chunk) =>
      chunk.tokens <= 800 ||
      (chunk.tokens <= 2000 && /^\s*```/m.test(chunk.content)),
  );
