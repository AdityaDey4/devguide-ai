import { MAX_CHARS_PER_SNIPPET } from "./config";
import type { Library, Snippet } from "./types";

// Context7 answers with plain text, not JSON. These two functions read it.
//
// resolve-library-id answers a list like this (best match first):
//
//   - Title: Zod
//   - Context7-compatible library ID: /colinhacks/zod
//   - Code Snippets: 1900
//   ----------
//   - Title: Zod
//   - Context7-compatible library ID: /websites/zod_dev
//
// query-docs answers snippets separated by a line of dashes:
//
//   ### Define and parse schemas with Zod
//   Source: https://github.com/colinhacks/zod/blob/main/packages/docs/content/index.mdx
//   Defines an object schema ...
//   ```ts
//   const User = z.object({ name: z.string() });
//   ```

const BLOCK_SEPARATOR = /\n-{10,}\n/;

export function parseLibraries(text: string): Library[] {
  return text
    .split(BLOCK_SEPARATOR)
    .map((block) => ({
      id: block.match(/Context7-compatible library ID:\s*(\S+)/)?.[1],
      title: block.match(/Title:\s*(.+)/)?.[1].trim() ?? "",
    }))
    .filter((library): library is Library => Boolean(library.id));
}

export function parseSnippets(text: string): Snippet[] {
  return text
    .split(BLOCK_SEPARATOR)
    .map((block) => block.trim())
    .map((block) => ({
      title: block.match(/^#{1,4}\s*(.+)$/m)?.[1].trim() ?? "",
      url: block.match(/^Source:\s*(https:\/\/\S+)/m)?.[1] ?? "",
      markdown: block,
    }))
    .filter((snippet) => snippet.url !== "" && snippet.markdown.length > 0)
    .map((snippet) => ({
      ...snippet,
      title: snippet.title || snippet.url,
      markdown: snippet.markdown.slice(0, MAX_CHARS_PER_SNIPPET),
    }));
}
