// "Scope" decides which URLs belong to the docs we are looking for.
//
//   docs at https://nextjs.org/docs:
//     accept("https://nextjs.org/docs/app/api?x=1#top")  -> "https://nextjs.org/docs/app/api"
//     accept("https://nextjs.org/blog/post")             -> null   (outside /docs)
//     accept("https://evil.com/docs/x")                  -> null   (other website)
//     accept("https://nextjs.org/docs/logo.png")         -> null   (not a page)
//
// URLs from llms.txt, sitemaps and page links are untrusted input, so everything goes through here.

export type Scope = {
  /** The docs address we were asked to explore (https, no query or hash). */
  base: URL;
  /** The URL if it is a docs page of this site (cleaned up), otherwise null. */
  accept: (raw: string, relativeTo?: URL) => string | null;
  /** True if the host is this site's (used for sitemap files, which may live outside the docs path). */
  sameSite: (url: URL) => boolean;
};

// Files that are not pages.
const NOT_A_PAGE =
  /\.(png|jpe?g|gif|svg|webp|avif|ico|pdf|zip|gz|tgz|tar|css|js|mjs|map|json|xml|txt|csv|woff2?|ttf|otf|eot|mp4|webm|mp3)$/i;

// Translated copies of the docs would only duplicate the English pages.
const LOCALES = new Set(
  "fr de es ja ko zh zh-cn zh-tw pt pt-br ru it tr vi id pl nl uk ar he hi th sv".split(
    " ",
  ),
);

const withoutWww = (host: string) => host.replace(/^www\./, "");

export function createScope(docsUrl: string): Scope {
  let base: URL;
  try {
    base = new URL(docsUrl);
  } catch {
    throw new Error(`Not a valid URL: ${docsUrl}`);
  }
  if (base.protocol !== "https:") {
    throw new Error(`The docs URL must use https: ${docsUrl}`);
  }
  base.hash = "";
  base.search = "";

  const basePath = base.pathname.replace(/\/+$/, ""); // "" for a site root
  const sameSite = (url: URL) =>
    withoutWww(url.hostname) === withoutWww(base.hostname);

  function accept(raw: string, relativeTo: URL = base): string | null {
    let url: URL;
    try {
      url = new URL(raw, relativeTo);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" || !sameSite(url)) return null;

    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (basePath && path !== basePath && !path.startsWith(basePath + "/"))
      return null;
    if (NOT_A_PAGE.test(path)) return null;

    // "/fr/docs/x" is a translation, unless the docs themselves live under "/fr".
    const firstSegment = path.split("/")[1]?.toLowerCase() ?? "";
    if (
      LOCALES.has(firstSegment) &&
      !basePath.toLowerCase().startsWith("/" + firstSegment)
    ) {
      return null;
    }

    // Query strings and #anchors point into the same page ("/api?id=strings"): drop them.
    return `https://${url.host}${path === "/" ? "/" : path}`;
  }

  return { base, accept, sameSite };
}
