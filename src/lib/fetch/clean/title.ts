import { text } from "./shared";

/** The page title: the first h1, or the <title> tag without the site name. */
export function findTitle(
  doc: Document,
  root: Element,
  markdown: string,
): string {
  const h1 = text(root.querySelector("h1")) || text(doc.querySelector("h1"));
  if (h1) return h1;

  const documentTitle = text(doc.querySelector("title"));
  // "Defining schemas | Zod" -> "Defining schemas"
  const withoutSite = documentTitle.match(/^(.{3,}?)\s+[|–—-]\s+.+$/)?.[1];
  return (
    withoutSite ??
    (documentTitle || markdown.split("\n", 1)[0].replace(/^#+\s*/, ""))
  );
}
