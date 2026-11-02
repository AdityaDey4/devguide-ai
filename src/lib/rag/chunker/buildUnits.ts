import { countTokens } from "./tokens";
import type { Block, Unit } from "./types";

// STEP 2: group the blocks into units that must stay together, and note where each one sits.
//
//   heading "## Strings" + text "Use z.string()."          -> ONE unit (a heading never ends a chunk)
//   text "Run it like this:" + code block                  -> ONE unit (the code keeps its intro)
//
// Each unit also gets its heading path, e.g. ["Zod", "Strings"].

export function buildUnits(blocks: Block[], pageTitle?: string): Unit[] {
  const stack: { level: number; title: string }[] = []; // the headings we are currently under
  const units: Unit[] = [];

  let lead: string[] = []; // headings and text waiting to become a unit
  let code: string | undefined;
  let hasBody = false; // true once something other than a heading is waiting
  let majorStart = false;
  let path: string[] = [];

  // The page title is the root of every path, unless the page's own "# heading" already is.
  const currentPath = () => {
    const titles = stack.map((h) => h.title);
    return pageTitle && stack[0]?.level !== 1 ? [pageTitle, ...titles] : titles;
  };

  function emit() {
    if (lead.length === 0 && code === undefined) return;
    const leadText = lead.join("\n\n");
    const text =
      code === undefined
        ? leadText
        : leadText
          ? `${leadText}\n\n${code}`
          : code;
    units.push({
      text,
      lead: leadText,
      code,
      tokens: countTokens(text),
      path,
      majorStart,
    });
    lead = [];
    code = undefined;
    hasBody = false;
    majorStart = false;
  }

  blocks.forEach((block, index) => {
    if (block.kind === "heading") {
      if (hasBody) emit(); // the text above is finished; this heading starts the next unit

      while (stack.length > 0 && stack[stack.length - 1].level >= block.level) {
        stack.pop();
      }
      stack.push({ level: block.level, title: block.title });

      if (block.level <= 2) majorStart = true;
      lead.push(block.text);
      path = currentPath();
      return;
    }

    if (lead.length === 0 && code === undefined) path = currentPath();
    hasBody = true;
    if (block.kind === "code") code = block.text;
    else lead.push(block.text);

    // "Run it like this:" belongs together with the code block that follows it.
    const introducesCode =
      block.kind === "text" &&
      block.text.trimEnd().endsWith(":") &&
      blocks[index + 1]?.kind === "code";
    if (!introducesCode) emit();
  });
  emit();

  return units;
}
