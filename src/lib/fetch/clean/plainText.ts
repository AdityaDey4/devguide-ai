import { normalizeMarkdown } from "./normalizeMarkdown";
import { closesFence, fenceMarker } from "./shared";
import type { CleanedPage } from "./types";

// SHORTCUT for pages that already are Markdown or plain text (llms.txt, README files, and
// sites like Supabase that answer with Markdown). No HTML steps are needed, only tidying.
//
// Some sites (react.dev) answer with MDX: YAML front matter, then Markdown with JSX tags:
//   ---\ntitle: "State"\n---\n\n<Intro>\n\nText...\n\n</Intro>
// The front matter becomes the title and the <Intro> lines are dropped.

export function cleanPlainText(source: string): CleanedPage {
  const { body, frontMatterTitle } = stripFrontMatter(source);
  const markdown = normalizeMarkdown(dropMdxComponentTags(body));
  const firstHeading = markdown.match(/^#\s+(.+)$/m)?.[1] ?? "";
  return {
    title: frontMatterTitle || firstHeading,
    markdown,
    method: "plain",
  };
}

function stripFrontMatter(source: string): {
  body: string;
  frontMatterTitle: string;
} {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { body: source, frontMatterTitle: "" };

  const title = match[1].match(/^title:\s*(.+)$/m)?.[1] ?? "";
  return {
    body: source.slice(match[0].length),
    frontMatterTitle: title.trim().replace(/^(["'])(.*)\1$/, "$2"), // remove quotes
  };
}

/** Drops lines that are only an MDX component tag (<Intro>, </Note>, <Sandpack />). */
function dropMdxComponentTags(source: string): string {
  let openFence: string | null = null;
  return source
    .split("\n")
    .filter((line) => {
      const marker = fenceMarker(line);
      if (openFence) {
        if (closesFence(marker, openFence)) openFence = null;
        return true; // inside a code fence: keep every line
      }
      if (marker) {
        openFence = marker;
        return true;
      }
      return !/^\s*<\/?[A-Z][A-Za-z0-9]*(\s[^<>]*)?\/?>\s*$/.test(line);
    })
    .join("\n");
}
