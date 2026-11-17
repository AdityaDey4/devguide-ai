import Link from "next/link";
import { ChatPanel } from "@/components/chat/chat-panel";
import { buttonVariants } from "@/components/ui/button";
import { linkCitations } from "@/lib/guide/citations";
import type { VersionEntry } from "@/lib/guide/history";
import type { LoadedGuide } from "@/lib/guide/load";
import { guideDate } from "@/lib/guide/pdf";
import { DownloadPdf } from "./download-pdf";
import { GuideEditor } from "./guide-editor";
import { GuideMarkdown } from "./guide-markdown";
import { RestoreButton } from "./restore-button";
import { VersionList } from "./version-list";

// A finished guide: title, the sections in order, then one numbered list of sources (M4), with the
// chat panel beside it (M6). An Edit button turns the sections into boxes to edit (M8): with
// `editing` the editor is shown in place of the sections. When the guide is the person's own copy
// the header says so. A History link shows the version list (`versions`); an older version opens
// read-only with a Restore button (your own copy only).
export function GuideView({
  guide,
  editing: editingRequested = false,
  versions,
}: {
  guide: LoadedGuide;
  editing?: boolean;
  /** Set to show the version history in place of the sections. */
  versions?: VersionEntry[];
}) {
  const older = guide.versionNo !== guide.currentVersionNo;
  // An edit always starts from the current version, so an old one is never put in the editor.
  const editing = editingRequested && !older;
  const { sections, sources } = linkCitations(guide.sections);

  return (
    <div className="flex flex-1">
      <article className="print-fill mx-auto w-full max-w-3xl min-w-0 flex-1 px-6 py-10">
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
                <span className="hidden print:inline">
                  {" "}
                  · Generated {guideDate(guide.createdAt)}
                </span>
              </p>
            </div>
            {!editing && !versions && (
              <div className="flex shrink-0 gap-2 print:hidden">
                <DownloadPdf slug={guide.slug} versionNo={guide.versionNo} />
                <Link
                  href="?versions=1"
                  className={buttonVariants({ variant: "ghost" })}
                >
                  History
                </Link>
                {!older && (
                  <Link
                    href="?edit=1"
                    className={buttonVariants({ variant: "outline" })}
                  >
                    Edit
                  </Link>
                )}
              </div>
            )}
            {versions && (
              <Link
                href={`/g/${guide.slug}`}
                className={buttonVariants({ variant: "outline" })}
              >
                Back to the guide
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

        {older && !editing && !versions && (
          <div
            role="note"
            className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm print:hidden"
          >
            <p>
              You are viewing version {guide.versionNo}. The current version is{" "}
              {guide.currentVersionNo}.{" "}
              <Link
                href={`/g/${guide.slug}`}
                className="text-primary underline underline-offset-2"
              >
                Back to the current version
              </Link>
            </p>
            {guide.mine ? (
              <RestoreButton
                guideId={guide.guideId}
                slug={guide.slug}
                versionNo={guide.versionNo}
              />
            ) : (
              <p className="text-muted-foreground">
                Go back to the current version and edit it to get your own copy,
                which can restore versions.
              </p>
            )}
          </div>
        )}

        {versions ? (
          <VersionList slug={guide.slug} versions={versions} />
        ) : editing ? (
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
                <ol className="print-url mt-3 space-y-1.5 text-sm">
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
