import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

// STEP 4: convert the content's HTML to Markdown.
//
//   <h2>Strings</h2><p>See <a href="/api">the API</a>.</p>   ->   ## Strings\n\nSee [the API](https://zod.dev/api).
//
// Uses the Turndown library, plus a few rules of our own.

export function htmlToMarkdown(root: Element, baseUrl: string): string {
  ensureTableHeaders(root);
  return createConverter(baseUrl).turndown(root.innerHTML);
}

function createConverter(baseUrl: string): TurndownService {
  const converter = new TurndownService({
    headingStyle: "atx", // "## Title", not underlined
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "_",
    hr: "---",
  });
  converter.use(gfm); // tables and strikethrough

  // Code blocks were simplified in step 3, so only the text and data-lang are needed.
  converter.addRule("codeBlock", {
    filter: "pre",
    replacement: (_content, node) => {
      const code = node.textContent ?? "";
      if (!code.trim()) return "";
      const fence = fenceFor(code);
      const language = (node as Element).getAttribute("data-lang") ?? "";
      return `\n\n${fence}${language}\n${code}\n${fence}\n\n`;
    },
  });

  // Images carry no text for search. Keep a figure's caption, drop the picture.
  converter.addRule("dropImages", {
    filter: ["img", "picture", "figure"],
    replacement: (content, node) => (node.nodeName === "FIGURE" ? content : ""),
  });

  // Links become absolute so citations still work when the text is read elsewhere.
  converter.addRule("absoluteLinks", {
    filter: (node) => node.nodeName === "A" && node.hasAttribute("href"),
    replacement: (content, node) => {
      const label = content.replace(/\s+/g, " ").trim();
      if (!label) return "";
      try {
        const href = (node as Element).getAttribute("href") ?? "";
        const url = new URL(href, baseUrl);
        // javascript:, mailto: and the like are not documentation links: keep the text only.
        if (url.protocol !== "http:" && url.protocol !== "https:") return label;
        return `[${label}](${url.href.replace(/\(/g, "%28").replace(/\)/g, "%29")})`;
      } catch {
        return label;
      }
    },
  });

  return converter;
}

/** A fence one backtick longer than any run inside the code, so the code cannot close it. */
function fenceFor(code: string): string {
  const longestRun = Math.max(
    0,
    ...(code.match(/`+/g) ?? []).map((run) => run.length),
  );
  return "`".repeat(Math.max(3, longestRun + 1));
}

/** Markdown tables need a header row, so promote the first row of header-less tables. */
function ensureTableHeaders(root: Element) {
  const doc = root.ownerDocument;
  root.querySelectorAll("table").forEach((table) => {
    if (table.querySelector("thead, th")) return;
    const firstRow = table.querySelector("tr");
    if (!firstRow) return;
    firstRow.querySelectorAll("td").forEach((cell) => {
      const header = doc.createElement("th");
      header.innerHTML = cell.innerHTML;
      cell.replaceWith(header);
    });
  });
}
