import Link from "next/link";
import { ChatPanel } from "@/components/chat/chat-panel";
import { buttonVariants } from "@/components/ui/button";
import { linkCitations } from "@/lib/guide/citations";
import type { LoadedGuide } from "@/lib/guide/load";
import { GuideEditor } from "./guide-editor";
import { GuideMarkdown } from "./guide-markdown";

// A finished guide: title, the sections in order, then one numbered list of sources (M4), with the
// chat panel beside it (M6). An Edit button turns the sections into boxes to edit (M8): with
// `editing` the editor is shown in place of the sections. When the guide is the person's own copy
// the header says so.
export function GuideView({
  guide,
  editing = false,
}: {
  guide: LoadedGuide;
  editing?: boolean;
}) {
  const { sections, sources } = linkCitations(guide.sections);

  return (
    <div className="flex flex-1">
      <article className="mx-auto w-full max-w-3xl min-w-0 flex-1 px-6 py-10">
        <header className="mb-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                {guide.name}
              </h1>
              <p className="text-muted-foreground mt-1 text-sm">
                {guide.mine ? "Your copy · " : ""}
                {guide.version ? `Version ${guide.version} · ` : ""}Guide v
                {guide.versionNo}
              </p>
            </div>
            {!editing && (
              <Link
                href="?edit=1"
                className={buttonVariants({ variant: "outline" })}
              >
                Edit
              </Link>
            )}
          </div>
          {guide.status === "partial" && (
            <p
              role="note"
              className="mt-4 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm"
            >
              Some parts of this guide could not be backed by sources. They are
              marked below.
            </p>
          )}
        </header>

        {editing ? (
          <GuideEditor guide={guide} />
        ) : (
          <>
            {sections.map((section) => (
              <section key={section.key} className="mb-10">
                <h2 className="text-xl font-semibold">{section.title}</h2>
                {section.needsReview && (
                  <p
                    role="note"
                    className="mt-2 rounded border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-sm"
                  >
                    Needs review: not every statement here could be checked
                    against the sources.
                  </p>
                )}
                <GuideMarkdown>{section.markdown}</GuideMarkdown>
              </section>
            ))}

            {sources.length > 0 && (
              <section
                aria-labelledby="sources-heading"
                className="border-t pt-6"
              >
                <h2 id="sources-heading" className="text-xl font-semibold">
                  Sources
                </h2>
                <ol className="mt-3 space-y-1.5 text-sm">
                  {sources.map((source) => (
                    <li key={source.n} className="flex gap-2">
                      <span className="text-muted-foreground w-6 shrink-0 text-right">
                        {source.n}.
                      </span>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-primary break-words underline underline-offset-2"
                      >
                        {source.title || source.url}
                      </a>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
      </article>
      <ChatPanel slug={guide.slug} name={guide.name} />
    </div>
  );
}
