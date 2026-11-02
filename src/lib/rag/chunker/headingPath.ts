// Heading paths: where in the page a piece of text sits.
//
//   "# Zod" > "## Strings" > "### Email"   ->   ["Zod", "Strings", "Email"]   ->   "Zod > Strings > Email"

/** The headings two or more paths have in common, from the top. */
export function commonPath(paths: string[][]): string[] {
  if (paths.length === 0) return [];
  const [first, ...rest] = paths;
  let length = first.length;
  for (const path of rest) {
    let i = 0;
    while (i < length && i < path.length && path[i] === first[i]) i++;
    length = i;
  }
  return first.slice(0, length);
}

export const formatPath = (path: string[]) => path.join(" > ");

/**
 * A heading's text without Markdown decoration:
 *   "`z.string()` [docs](/x)"       -> "z.string() docs"
 *   "Adding state {/*adding-state*\/}" -> "Adding state"  (MDX heading id; also {#adding-state})
 *   "3\. Introduction"              -> "3. Introduction"  (escape added by the HTML converter)
 */
export function cleanHeadingTitle(raw: string): string {
  return raw
    .replace(/\s*\{(?:\/\*?[\w-]+\*?\/|#[\w-]+)\}\s*$/, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*]/g, "")
    .replace(/\\([\\_{}[\]()#+.!|-])/g, "$1")
    .trim();
}
