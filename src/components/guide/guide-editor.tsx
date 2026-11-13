"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { LoadedGuide } from "@/lib/guide/load";
import { saveGuideEdit } from "@/lib/guide/client";
import { MAX_NOTE_CHARS, MAX_SECTION_CHARS } from "@/lib/guide/edit/request";

// Edit mode of a guide (M8, SRS FR-GUIDE-3): one Markdown box per section and a Save with an
// optional note.
//
//   changes the "Installation" text, writes "Fixed the command", presses Save
//     -> POST /api/guides/<id>/versions { sections: [{ key: "installation", markdown }], note }
//     -> back to the guide, which now shows the person's own copy with the change
//
// Only the sections that were really changed are sent. The first save of a shared guide makes the
// person's own copy; the shared guide never changes.

type Props = {
  guide: Pick<LoadedGuide, "guideId" | "slug" | "mine" | "sections">;
};

const normalise = (text: string) => text.replace(/\r\n?/g, "\n");

export function GuideEditor({ guide }: Props) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(guide.sections.map((s) => [s.key, s.markdown])),
  );
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const back = `/g/${guide.slug}`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const changed = guide.sections
      .filter((s) => normalise(drafts[s.key]) !== s.markdown)
      .map((s) => ({ key: s.key, markdown: drafts[s.key] }));
    if (changed.length === 0) {
      setError("You haven't changed anything yet.");
      return;
    }

    setSaving(true);
    setError(null);
    const result = await saveGuideEdit(guide.guideId, changed, note);
    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }
    router.push(back);
    router.refresh(); // the guide page now loads the person's own copy
  }

  return (
    <form onSubmit={onSubmit} aria-label="Edit the guide">
      <p
        role="note"
        className="bg-surface-2 mb-8 rounded-lg border p-3 text-sm"
      >
        {guide.mine
          ? "You are editing your copy of this guide. Each save is a new version."
          : "Saving makes your own copy of this guide. The shared guide stays as it is."}
      </p>

      {guide.sections.map((section) => (
        <section key={section.key} className="mb-8">
          <label htmlFor={`edit-${section.key}`}>
            <h2 className="text-xl font-semibold">{section.title}</h2>
          </label>
          <textarea
            id={`edit-${section.key}`}
            value={drafts[section.key]}
            onChange={(event) =>
              setDrafts({ ...drafts, [section.key]: event.target.value })
            }
            rows={Math.min(24, drafts[section.key].split("\n").length + 2)}
            maxLength={MAX_SECTION_CHARS}
            spellCheck
            className="border-input focus-visible:ring-ring/50 mt-2 w-full rounded-lg border bg-transparent p-3 font-mono text-sm leading-relaxed outline-none focus-visible:ring-3"
          />
          {section.citations.length > 0 && (
            <p className="text-muted-foreground mt-1.5 text-xs">
              The markers like [1] in this text point to these sources:{" "}
              {section.citations.map((citation, i) => (
                <span key={citation.n}>
                  {i > 0 && "; "}[{citation.n}] {citation.title || citation.url}
                </span>
              ))}
            </p>
          )}
        </section>
      ))}

      <div className="bg-background sticky bottom-0 -mx-6 border-t px-6 py-4">
        <label className="block text-sm font-medium" htmlFor="edit-note">
          What did you change? (optional)
        </label>
        <input
          id="edit-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={MAX_NOTE_CHARS}
          placeholder="e.g. Fixed the install command"
          className="border-input focus-visible:ring-ring/50 mt-1 h-9 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
        />
        {error && (
          <p role="alert" className="text-destructive mt-2 text-sm">
            {error}
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save as a new version"}
          </Button>
          <Link
            href={back}
            className={buttonVariants({ variant: "outline" })}
            aria-disabled={saving}
          >
            Cancel
          </Link>
        </div>
      </div>
    </form>
  );
}
