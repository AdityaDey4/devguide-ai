// Who is this documentation about? A short id (slug) and a display name, from the address.
//
//   https://zod.dev                                  -> { slug: "zod",       name: "Zod" }
//   https://supabase.com/docs                        -> { slug: "supabase",  name: "Supabase" }
//   https://langchain-ai.github.io/langgraph/        -> { slug: "langgraph", name: "Langgraph" }
//
// Guesses are only a convenience: --slug and --name on the command line override them.

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,40}$/;
const GENERIC_PREFIXES = new Set([
  "www",
  "docs",
  "doc",
  "developer",
  "developers",
  "learn",
]);

export function technologyFor(
  docsUrl: string,
  overrides: { name?: string; slug?: string } = {},
): { name: string; slug: string } {
  const slug = overrides.slug ?? guessSlug(new URL(docsUrl));
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(
      `"${slug}" is not a usable slug (use lowercase letters, digits and dashes). Pass --slug.`,
    );
  }
  return { slug, name: overrides.name ?? toDisplayName(slug) };
}

/**
 * The slug a technology's NAME gives, or null when the name cannot make a usable one. Same
 * spelling as the search box (lib/search/normalise.ts), so what a person types finds the guide.
 * Better than the address when the docs live on a shared vendor site:
 *
 *   slugFromName("Java")     -> "java"     (the address docs.oracle.com would give "oracle")
 *   slugFromName("Next.js")  -> "nextjs"
 *   slugFromName("C++")      -> null       (use the address instead)
 */
export function slugFromName(name: string): string | null {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[\s._-]+/g, "");
  return SLUG_PATTERN.test(slug) ? slug : null;
}

function guessSlug(url: URL): string {
  const host = url.hostname.toLowerCase();

  // Project sites on GitHub Pages: the name is the first path segment.
  if (host.endsWith(".github.io")) {
    const firstSegment = url.pathname.split("/").filter(Boolean)[0];
    return firstSegment ?? host.split(".")[0];
  }

  const labels = host.split(".");
  labels.pop(); // the ending: .dev, .com, .org
  while (labels.length > 1 && GENERIC_PREFIXES.has(labels[0])) labels.shift();
  // A host with a single label ("localhost") has nothing left after the ending: use it whole.
  return labels[labels.length - 1] ?? host;
}

/** "next-js" -> "Next Js" */
function toDisplayName(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
