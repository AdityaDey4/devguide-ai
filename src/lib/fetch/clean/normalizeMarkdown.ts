import { closesFence, fenceMarker } from "./shared";

// STEP 5: tidy the Markdown text.
//
//   - at most one blank line in a row
//   - no trailing spaces
//   - invisible characters removed (zero-width spaces, BOM), non-breaking space -> space
//
// Code inside ``` fences is never touched: its blank lines and spaces can be meaningful.

export function normalizeMarkdown(markdown: string): string {
  const lines = markdown
    .replace(/\r\n?/g, "\n")
    .replace(/[​‌‍﻿]/g, "")
    .replace(/ /g, " ")
    .split("\n");

  const out: string[] = [];
  let openFence: string | null = null;
  let blankRun = 0;

  for (const line of lines) {
    const marker = fenceMarker(line);

    if (openFence) {
      out.push(line); // inside code: keep exactly as is
      if (closesFence(marker, openFence)) openFence = null;
      continue;
    }
    if (marker) {
      openFence = marker;
      blankRun = 0;
      out.push(line.trimEnd());
      continue;
    }

    const trimmed = line.trimEnd();
    blankRun = trimmed === "" ? blankRun + 1 : 0;
    if (blankRun <= 1) out.push(trimmed);
  }
  return out.join("\n").trim();
}
