import {
  MIN_USEFUL_PAGES,
  SITEMAP_MAX_DEPTH,
  SITEMAP_MAX_FILES,
} from "./config";
import type { Scope } from "./scope";
import { candidateUrls, errorMessage, titleFromUrl } from "./shared";
import type { DiscoveredPage, DiscoverDeps, SourceOutcome } from "./types";

// SOURCE 2: sitemap.xml, the page list that search engines read.
//
//   <urlset><url><loc>https://zod.dev/api</loc></url> ...</urlset>   -> pages
//   <sitemapindex><sitemap><loc>https://x.dev/sitemap-1.xml</loc> ... -> more sitemap files
//
// A sitemap has no titles, so titles are guessed from the URL; the real title comes later,
// when the page itself is fetched.

export async function fromSitemap(
  scope: Scope,
  deps: DiscoverDeps,
  signal?: AbortSignal,
): Promise<SourceOutcome> {
  const notes: string[] = [];
  const found = new Map<string, DiscoveredPage>();
  const filesSeen = new Set<string>();

  async function readFile(fileUrl: string, depth: number) {
    if (filesSeen.has(fileUrl) || filesSeen.size >= SITEMAP_MAX_FILES) return;
    filesSeen.add(fileUrl);

    try {
      const file = await deps.fetchPage(fileUrl, { signal });
      const locations = extractLocations(file.body);

      if (/<sitemapindex[\s>]/i.test(file.body)) {
        // An index lists other sitemap files. Follow them, but only on this site.
        if (depth >= SITEMAP_MAX_DEPTH) return;
        for (const location of locations) {
          if (isSameSiteHttps(location, scope))
            await readFile(location, depth + 1);
        }
        return;
      }

      for (const location of locations) {
        const url = scope.accept(location);
        if (url && !found.has(url))
          found.set(url, { url, title: titleFromUrl(url) });
      }
    } catch (error) {
      notes.push(`${fileUrl}: ${errorMessage(error)}`);
    }
  }

  // The usual places first...
  for (const address of candidateUrls(scope, "sitemap.xml")) {
    await readFile(address, 0);
    if (found.size >= MIN_USEFUL_PAGES) break;
  }

  // ...then wherever robots.txt says the sitemap is.
  if (found.size < MIN_USEFUL_PAGES) {
    for (const address of await sitemapsFromRobots(
      scope,
      deps,
      signal,
      notes,
    )) {
      await readFile(address, 0);
    }
  }

  return {
    pages: Array.from(found.values()),
    note: notes.join("; ") || undefined,
  };
}

async function sitemapsFromRobots(
  scope: Scope,
  deps: DiscoverDeps,
  signal: AbortSignal | undefined,
  notes: string[],
): Promise<string[]> {
  try {
    const robots = await deps.fetchPage(`${scope.base.origin}/robots.txt`, {
      signal,
    });
    return Array.from(
      robots.body.matchAll(/^\s*sitemap:\s*(\S+)/gim),
      (m) => m[1],
    ).filter((address) => isSameSiteHttps(address, scope));
  } catch (error) {
    notes.push(`robots.txt: ${errorMessage(error)}`);
    return [];
  }
}

function isSameSiteHttps(address: string, scope: Scope): boolean {
  try {
    const url = new URL(address);
    return url.protocol === "https:" && scope.sameSite(url);
  } catch {
    return false;
  }
}

/** Every <loc>...</loc> value in an XML file, decoded. */
export function extractLocations(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi), (m) =>
    decodeXml(m[1]),
  ).filter(Boolean);
}

function decodeXml(value: string): string {
  return value
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&") // last, so "&amp;lt;" does not become "<"
    .trim();
}
