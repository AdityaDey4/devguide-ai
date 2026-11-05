import { MAX_PAGES_PER_SECTION, SECTIONS } from "../../sections";
import type { DocPage, OutlineSection } from "../../state";
import type { OutlineAnswerType } from "./schema";

// The model's plan is a suggestion; the outline we keep is always valid (FR-GEN-4): exactly the 7
// standard sections in order, each with 1 to 4 pages that really are in the discovered list.
//
//   model gave "/made-up" for a section   -> dropped
//   model gave 7 pages for a section      -> first 4 kept
//   model gave nothing usable             -> the first discovered page (usually the docs home)
//   model left a section out              -> it still gets its place, with the fallback page

export function toOutline(
  answer: OutlineAnswerType,
  pages: DocPage[],
): OutlineSection[] {
  const known = new Set(pages.map((page) => page.url));
  const fallback = pages[0].url;

  return SECTIONS.map((section) => {
    const planned = answer.sections.find((s) => s.key === section.key);
    const urls = [...new Set(planned?.pageUrls ?? [])]
      .filter((url) => known.has(url))
      .slice(0, MAX_PAGES_PER_SECTION);

    return {
      key: section.key,
      title: section.title,
      goal: section.goal,
      pageUrls: urls.length > 0 ? urls : [fallback],
      codeHeavy: planned?.codeHeavy ?? section.codeHeavy,
    };
  });
}
