import type { Scope } from "./scope";

// Small helpers used by more than one source.

/**
 * Where a file such as llms.txt or sitemap.xml might live for this docs site: next to the
 * docs first, then at the site root.
 *
 *   docs at https://nextjs.org/docs, file "llms.txt":
 *     -> https://nextjs.org/docs/llms.txt, https://nextjs.org/llms.txt
 */
export function candidateUrls(scope: Scope, file: string): string[] {
  const basePath = scope.base.pathname.replace(/\/+$/, "");
  return Array.from(
    new Set([
      `${scope.base.origin}${basePath}/${file}`,
      `${scope.base.origin}/${file}`,
    ]),
  );
}

/**
 * A readable title guessed from a URL, for sources that do not list titles.
 *   https://zod.dev/api/string-formats  ->  "String formats"
 */
export function titleFromUrl(url: string): string {
  const parsed = new URL(url);
  const last = parsed.pathname.split("/").filter(Boolean).pop();
  if (!last) return parsed.hostname;

  let words: string;
  try {
    words = decodeURIComponent(last);
  } catch {
    words = last; // not valid percent-encoding: use it as is
  }
  words = words
    .replace(/\.(html?|mdx?)$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
