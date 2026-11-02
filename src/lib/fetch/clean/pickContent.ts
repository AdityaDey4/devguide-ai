import { Readability } from "@mozilla/readability";
import type { ContentMethod } from "./types";
import { MAIN_SELECTOR, text } from "./shared";

// STEP 2: find the part of the page that is the content.
//
//   returns the element to convert (usually <main> or the <article> inside it)
//   plus how it was found, for debugging.

const MIN_CONTENT_CHARS = 200;

export function pickContent(doc: Document): {
  root: Element;
  method: ContentMethod;
} {
  // 1. Documentation sites almost always mark their content with <main>/<article>.
  //    That is exact, so it wins. (Readability is built for news articles: tests showed it
  //    turns h1 into h2 and drops callouts, short sections and code blocks from docs.)
  const main = doc.querySelector(MAIN_SELECTOR);
  if (main && text(main).length >= MIN_CONTENT_CHARS) {
    return { root: preferInnerArticle(main), method: "main" };
  }

  // 2. No landmark: let Readability find the content.
  const readable = findWithReadability(doc);
  if (readable) return { root: readable, method: "readability" };

  // 3. Last resort: everything left after junk removal.
  return { root: doc.body, method: "body" };
}

/**
 * Some layouts wrap the sidebar AND the page in <main> (zod.dev). The <article> inside is
 * then the page itself, so take it when it holds most of the text.
 */
function preferInnerArticle(main: Element): Element {
  const article = Array.from(main.querySelectorAll("article")).sort(
    (a, b) => text(b).length - text(a).length,
  )[0];
  const holdsMostOfThePage =
    article &&
    text(article).length >= MIN_CONTENT_CHARS &&
    text(article).length >= 0.5 * text(main).length;
  return holdsMostOfThePage ? article : main;
}

function findWithReadability(doc: Document): Element | null {
  try {
    const article = new Readability(doc.cloneNode(true) as Document, {
      keepClasses: true, // language-xxx classes are needed for code fences
      charThreshold: 100,
    }).parse();
    if (!article?.content) return null;

    const container = doc.createElement("div");
    container.innerHTML = article.content;
    return text(container).length >= MIN_CONTENT_CHARS ? container : null;
  } catch {
    return null; // Readability can throw on odd pages; fall back to the body
  }
}
