// STEP 3: make every code block simple.
//
//   before: <pre class="prism-code language-ts"><span class="token-line">const a = 1;<br></span>...</pre>
//   after:  <pre data-lang="ts"><code>const a = 1;</code></pre>
//
// Syntax highlighters wrap every token in spans and build line breaks in many different ways.
// We do this in jsdom (full DOM) because the Markdown converter in step 4 re-parses the HTML
// with a smaller DOM; after this step it only needs a block's text and its data-lang.

// Elements that hold one line of code:
// Shiki ".line", Docusaurus/Prism ".token-line", Expressive Code ".ec-line".
const CODE_LINE = ".line, .token-line, .code-line, .ec-line";
const CODE_LINE_NUMBER =
  ".line-number, .linenumber, .line-numbers-rows, [data-line-number], [class*='lineNumber']";

// Language names that mean "no language".
const NO_LANGUAGE = new Set([
  "plaintext",
  "text",
  "txt",
  "plain",
  "none",
  "nohighlight",
]);
const LANGUAGE_ALIASES: Record<string, string> = {
  shellscript: "bash",
  python3: "python",
  pycon: "python",
  default: "",
};
// Matches class names like language-ts, lang-ts, and the wrappers Sphinx ("highlight-python3")
// and GitHub ("highlight-source-js") put on a parent element.
const LANGUAGE_CLASS =
  /(?:^|[\s_-])(?:language|lang|highlight(?:-source)?)[-:_]([A-Za-z0-9#+._]+)/i;

export function simplifyCodeBlocks(root: Element) {
  const doc = root.ownerDocument;
  root.querySelectorAll("pre").forEach((pre) => {
    const simple = doc.createElement("pre");
    simple.setAttribute("data-lang", detectLanguage(pre));
    const code = doc.createElement("code");
    code.textContent = extractCode(pre);
    simple.append(code);
    pre.replaceWith(simple);
  });
}

/** The code of a <pre> block with its line breaks, however the highlighter built it. */
function extractCode(original: Element): string {
  const pre = original.cloneNode(true) as Element; // work on a copy
  pre.querySelectorAll(CODE_LINE_NUMBER).forEach((el) => el.remove());
  pre.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));

  // Some highlighters wrap each line in an element and rely on CSS for the line break.
  pre.querySelectorAll(CODE_LINE).forEach((line) => {
    // Only the outermost line element, or nested ones would add extra line breaks.
    if (line.parentElement?.closest(CODE_LINE)) return;
    const next = line.nextSibling;
    const newlineFollows =
      next?.nodeType === 3 && (next.textContent ?? "").startsWith("\n");
    if (!newlineFollows && !(line.textContent ?? "").endsWith("\n")) {
      line.append("\n");
    }
  });

  return (pre.textContent ?? "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, "")) // highlighters often leave a trailing space
    .join("\n")
    .replace(/\s+$/, "")
    .replace(/^\n+/, "");
}

/** "ts", "python", ... or "" when the page does not say. Never guesses. */
function detectLanguage(pre: Element): string {
  // The block itself, its <code>, and two levels of parents (Sphinx puts it on a wrapper).
  const candidates = [
    pre,
    pre.querySelector("code"),
    pre.parentElement,
    pre.parentElement?.parentElement,
  ];
  for (const element of candidates) {
    if (!element) continue;
    const attribute =
      element.getAttribute("data-language") ??
      element.getAttribute("data-lang");
    if (attribute) return normalizeLanguage(attribute);

    const match = (element.getAttribute("class") ?? "").match(LANGUAGE_CLASS);
    if (match) return normalizeLanguage(match[1]);
  }
  return "";
}

function normalizeLanguage(raw: string): string {
  const language = raw.trim().toLowerCase();
  if (NO_LANGUAGE.has(language)) return "";
  return LANGUAGE_ALIASES[language] ?? language;
}
