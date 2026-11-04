import { cleanToMarkdown } from "../../../../fetch/clean";
import { MIN_PAGE_CHARS } from "../../../../ingest/config";
import type { GenerateDeps } from "../../deps";
import { MAX_CHARS_PER_PAGE, MAX_CHARS_PER_SECTION } from "./config";
import type { Material } from "./input";

// Gets the pages a section is written from: download, clean to Markdown, number them.
//
//   loadMaterial(["https://zod.dev/basics", "https://zod.dev/api"], deps)
//     -> { material: [{ n: 1, url, title: "Basic usage", markdown: "..." }, { n: 2, ... }],
//          full: [...] }   (`full` = the same pages uncut, for saving to the knowledge base)
//
// A page that cannot be fetched, or has next to no text, is skipped: one bad page must not stop
// the section. The numbers (1, 2, ...) are what the writer cites as [1], [2].

export type Loaded = { material: Material[]; full: Material[] };

export async function loadMaterial(
  urls: string[],
  deps: GenerateDeps,
): Promise<Loaded> {
  const pages = await Promise.all(urls.map((url) => load(url, deps)));
  const full = pages
    .filter((page): page is Omit<Material, "n"> => page !== null)
    .map((page, i) => ({ ...page, n: i + 1 }));

  let room = MAX_CHARS_PER_SECTION;
  const material = full.map((page) => {
    const markdown = page.markdown.slice(0, Math.min(MAX_CHARS_PER_PAGE, room));
    room -= markdown.length;
    return { ...page, markdown };
  });
  return { material: material.filter((m) => m.markdown.length > 0), full };
}

async function load(
  url: string,
  deps: GenerateDeps,
): Promise<Omit<Material, "n"> | null> {
  try {
    const fetched = await deps.fetchPage(url);
    const cleaned = cleanToMarkdown({
      body: fetched.body,
      url: fetched.url,
      contentType: fetched.contentType,
    });
    if (cleaned.markdown.length < MIN_PAGE_CHARS) return null;
    return {
      url: fetched.url,
      title: cleaned.title || fetched.url,
      markdown: cleaned.markdown,
    };
  } catch {
    return null;
  }
}
