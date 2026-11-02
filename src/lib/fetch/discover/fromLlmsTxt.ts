import type { Scope } from "./scope";
import { candidateUrls, errorMessage } from "./shared";
import type { DiscoveredPage, DiscoverDeps, SourceOutcome } from "./types";

// SOURCE 1: llms.txt, a list of pages that a site publishes for AI tools.
//
//   # Zod
//   - [Defining schemas](https://zod.dev/api): Complete API reference
//   - [Strings](https://zod.dev/api?id=strings)
//
//   -> [{ url: "https://zod.dev/api", title: "Defining schemas" }]
//   (the second line points into the same page, so it is dropped as a duplicate)

// A Markdown link: [title](url) or [title](url "tooltip")
const MARKDOWN_LINK = /\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;

export async function fromLlmsTxt(
  scope: Scope,
  deps: DiscoverDeps,
  signal?: AbortSignal,
): Promise<SourceOutcome> {
  const notes: string[] = [];

  for (const address of candidateUrls(scope, "llms.txt")) {
    try {
      const file = await deps.fetchPage(address, { signal });
      // Some sites answer unknown paths with a normal page instead of a 404.
      if (file.contentType === "text/html") {
        notes.push(`${address}: is a web page, not an llms.txt`);
        continue;
      }
      const pages = parseLlmsTxt(file.body, scope);
      if (pages.length > 0) return { pages };
      notes.push(`${address}: no links inside the docs scope`);
    } catch (error) {
      notes.push(`${address}: ${errorMessage(error)}`);
    }
  }
  return { pages: [], note: notes.join("; ") };
}

/** The docs pages listed in an llms.txt file, without duplicates. */
export function parseLlmsTxt(source: string, scope: Scope): DiscoveredPage[] {
  const pages = new Map<string, DiscoveredPage>();
  for (const [, label, href] of source.matchAll(MARKDOWN_LINK)) {
    const url = scope.accept(href);
    if (url && !pages.has(url)) pages.set(url, { url, title: label.trim() });
  }
  return Array.from(pages.values());
}
