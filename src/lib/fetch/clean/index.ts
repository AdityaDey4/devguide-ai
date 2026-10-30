import { JSDOM, VirtualConsole } from "jsdom";
import { simplifyCodeBlocks } from "./codeBlocks";
import { htmlToMarkdown } from "./markdown";
import { normalizeMarkdown } from "./normalizeMarkdown";
import { pickContent } from "./pickContent";
import { cleanPlainText } from "./plainText";
import { removeJunk } from "./removeJunk";
import { findTitle } from "./title";
import type { CleanedPage, CleanInput } from "./types";

export type { CleanedPage, CleanInput } from "./types";

// Turns a fetched docs page into clean Markdown (FR-KB-1).
// Node only (uses jsdom). The page's scripts are never run and no resources are loaded.
//
// Read this file first: it is the whole recipe, one line per step.

export function cleanToMarkdown(input: CleanInput): CleanedPage {
  // Markdown and plain text are already clean: only tidy them.
  if (
    input.contentType === "text/plain" ||
    input.contentType === "text/markdown"
  ) {
    return cleanPlainText(input.body);
  }

  const dom = new JSDOM(input.body, {
    url: input.url,
    contentType: "text/html",
    virtualConsole: new VirtualConsole(), // swallow CSS/parse warnings
  });

  try {
    const doc = dom.window.document;

    removeJunk(doc); // 1. delete menus, footers, buttons, scripts
    const { root, method } = pickContent(doc); // 2. find the content part of the page
    simplifyCodeBlocks(root); // 3. code blocks -> plain text + language
    const html = htmlToMarkdown(root, input.url); // 4. HTML -> Markdown
    let markdown = normalizeMarkdown(html); // 5. tidy blank lines and invisible characters

    // Readability can strip the h1, but chunk headings need the page title at the top.
    const title = findTitle(doc, root, markdown);
    if (title && !/^#\s/.test(markdown)) markdown = `# ${title}\n\n${markdown}`;

    return { title, markdown, method };
  } finally {
    dom.window.close(); // free jsdom's memory and timers
  }
}
