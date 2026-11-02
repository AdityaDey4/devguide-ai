import { createHash } from "node:crypto";

// The fingerprint of a text. Two chunks with the same fingerprint are the same chunk.
//
//   contentHash("const a = 1;  \r\n")  ===  contentHash("const a = 1;")     (same text, tidier)
//   contentHash("if (x) {\n  y();\n}")  !==  contentHash("if (x) {\ny();\n}")  (indentation matters)
//
// Only things that never change the meaning are ignored: Windows line endings, spaces at the
// end of a line, and blank space around the whole text.

export function contentHash(text: string): string {
  const normalised = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .trim();
  return createHash("sha256").update(normalised, "utf8").digest("hex");
}
