import { MAIN_SELECTOR, text } from "./shared";

// STEP 1: remove everything that is not content.
//
//   before: <nav>Home | Docs</nav> <main><h1>Strings</h1> <button>Copy</button> ...</main> <footer>...</footer>
//   after:  <main><h1>Strings</h1> ...</main>
//
// Works on the page's DOM, in place.

// Never content, wherever they are.
const NEVER_CONTENT = [
  "script, style, noscript, template, iframe, object, embed, svg, canvas, video, audio",
  "form, input, select, textarea, button, dialog",
  "nav, footer, [role='navigation'], [role='contentinfo'], [role='search']",
  "[hidden], [aria-hidden='true']",
  "[class*='cookie-banner'], [id*='cookie-banner'], [class*='cookie-consent']",
].join(", ");

// Page chrome when outside <main>/<article>, but real content inside them
// (a <header> that holds the h1, an <aside> used for a "Note" callout).
const CHROME_OUTSIDE_MAIN =
  "header, aside, [role='banner'], [role='complementary']";

// Short standalone lines that docs frameworks put inside <main>.
const BOILERPLATE_LINE =
  /^(edit (this )?page|edit (this page )?on github|suggest edits?|report an issue|was this page helpful\??)/i;
const TOC_HEADING = /^(on this page|table of contents|in this article)$/i;

export function removeJunk(doc: Document) {
  removeNeverContent(doc);
  removeBoilerplate(doc);
  removeChromeOutsideMain(doc);
  removeHeadingPermalinks(doc);
}

function removeNeverContent(doc: Document) {
  doc.querySelectorAll(NEVER_CONTENT).forEach((el) => {
    // A code block is never junk, and neither is an element that holds one. Tab panels that
    // are not the active tab are `hidden` but contain real examples (JS/TS, npm/pnpm/yarn).
    if (el.closest("pre") || el.querySelector("pre")) return;
    el.remove();
  });
}

function removeBoilerplate(doc: Document) {
  // "Edit this page on GitHub", "Was this page helpful?" and the like.
  doc.querySelectorAll("a, p, li, span, div").forEach((el) => {
    const label = text(el);
    if (
      label.length > 0 &&
      label.length < 120 &&
      BOILERPLATE_LINE.test(label)
    ) {
      el.remove();
    }
  });

  // An in-page table of contents: the heading plus the list of links under it.
  doc.querySelectorAll("h2, h3, h4").forEach((heading) => {
    if (!TOC_HEADING.test(text(heading))) return;
    const next = heading.nextElementSibling;
    if (next && (/^(UL|OL|NAV)$/.test(next.tagName) || linkRatio(next) > 0.8)) {
      next.remove();
    }
    heading.remove();
  });
}

/** Share of an element's text that is link text (0 to 1). A menu is close to 1. */
function linkRatio(el: Element): number {
  const total = text(el).length;
  if (total === 0) return 0;
  let linked = 0;
  el.querySelectorAll("a").forEach((a) => (linked += text(a).length));
  return linked / total;
}

function removeChromeOutsideMain(doc: Document) {
  doc.querySelectorAll(CHROME_OUTSIDE_MAIN).forEach((el) => {
    if (!el.closest(MAIN_SELECTOR)) el.remove();
  });
}

/** Headings often end with a "#" or "¶" permalink link. Drop it, keep the heading text. */
function removeHeadingPermalinks(doc: Document) {
  doc.querySelectorAll("h1 a, h2 a, h3 a, h4 a, h5 a, h6 a").forEach((link) => {
    const label = (link.textContent ?? "").replace(/[\s​]/g, "");
    if (label === "" || /^[#¶§🔗]+$/u.test(label)) link.remove();
    // A real link inside a heading: keep its text, drop the link itself.
    else link.replaceWith(...Array.from(link.childNodes));
  });
}
