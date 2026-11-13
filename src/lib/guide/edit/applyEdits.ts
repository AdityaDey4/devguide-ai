import type { GuideSection } from "../../agents/generate/guide/saveGuide";

// Puts a person's edited text into a guide's sections (SRS FR-GUIDE-3). No database here.
//
//   applyEdits(current, [{ key: "installation", markdown: "Run `npm i zod` [1]." }])
//     -> { ok: true, sections: [...same sections, "installation" now has the new text...], changed: ["installation"] }
//
// Only the Markdown of a section can change: its title, its sources (the [1], [2] list) and its
// "needs review" flag stay as they are, and a section cannot be emptied. A save that changes nothing is refused, so no empty
// version is ever made (and no personal copy for a save that did nothing).

export type EditEntry = { key: string; markdown: string };

export type Applied =
  | { ok: true; sections: GuideSection[]; changed: string[] }
  | { ok: false; error: string };

/** Windows line endings would make every untouched section look edited. */
const normalise = (text: string) => text.replace(/\r\n?/g, "\n");

export function applyEdits(
  current: GuideSection[],
  edits: EditEntry[],
): Applied {
  const keys = new Set(current.map((section) => section.key));
  const seen = new Set<string>();
  for (const edit of edits) {
    if (!keys.has(edit.key)) {
      return { ok: false, error: `There is no section "${edit.key}"` };
    }
    if (seen.has(edit.key)) {
      return { ok: false, error: `Section "${edit.key}" was sent twice` };
    }
    if (edit.markdown.trim() === "") {
      return { ok: false, error: `Section "${edit.key}" cannot be empty` };
    }
    seen.add(edit.key);
  }

  const newText = new Map(
    edits.map((edit) => [edit.key, normalise(edit.markdown)]),
  );
  const changed: string[] = [];
  const sections = current.map((section) => {
    const text = newText.get(section.key);
    if (text === undefined || text === section.markdown) return section;
    changed.push(section.key);
    return { ...section, markdown: text };
  });

  if (changed.length === 0) return { ok: false, error: "Nothing was changed" };
  return { ok: true, sections, changed };
}
