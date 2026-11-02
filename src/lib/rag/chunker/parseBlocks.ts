import { cleanHeadingTitle } from "./headingPath";
import type { Block } from "./types";

// STEP 1: cut the Markdown into blocks: headings, fenced code blocks and plain text.
//
//   "## Strings\n\nUse `z.string()`.\n\n```ts\nz.string();\n```"
//   -> [ heading "Strings", text "Use `z.string()`.", code "```ts ... ```" ]
//
// A fenced code block is ONE block, however many blank lines are inside it. That is what
// makes it impossible for the later steps to cut through code.

// Any indentation: a code block inside a list item is indented by its list ("    ```python").
const FENCE_OPEN = /^\s*(`{3,}|~{3,})/;
const FENCE_LINE = /^\s*(`{3,}|~{3,})\s*$/;
// "## Title" or "## Title ##", but "## Using C#" keeps its "#".
const HEADING = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;

export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const endParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "text", text: paragraph.join("\n") });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = line.match(FENCE_OPEN)?.[1];
    if (fence) {
      endParagraph();
      const code = [line];
      i++;
      while (i < lines.length && !closesFence(lines[i], fence)) {
        code.push(lines[i]);
        i++;
      }
      // The closing fence (or, for a fence left open at the end of the page, a made-up one).
      code.push(i < lines.length ? lines[i] : fence);
      blocks.push({ kind: "code", text: code.join("\n") });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      endParagraph();
      blocks.push({
        kind: "heading",
        level: heading[1].length,
        title: cleanHeadingTitle(heading[2]),
        text: line.trimEnd(),
      });
      continue;
    }

    if (line.trim() === "") endParagraph();
    else paragraph.push(line);
  }
  endParagraph();
  return blocks;
}

function closesFence(line: string, open: string): boolean {
  const marker = line.match(FENCE_LINE)?.[1];
  return (
    marker !== undefined &&
    marker[0] === open[0] &&
    marker.length >= open.length
  );
}
