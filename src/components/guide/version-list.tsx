import Link from "next/link";
import type { VersionEntry } from "@/lib/guide/history";

// The history of a guide (M8, SRS FR-GUIDE-5): every version, newest first, with its number, when
// it was saved, who wrote it and the note. A version opens at /g/<slug>?version=<n>, where it can
// be restored.
export function VersionList({
  slug,
  versions,
}: {
  slug: string;
  versions: VersionEntry[];
}) {
  return (
    <section aria-labelledby="history-heading">
      <h2 id="history-heading" className="text-xl font-semibold">
        Version history
      </h2>
      <ol className="mt-4 divide-y rounded-lg border">
        {versions.map((version) => (
          <li
            key={version.versionNo}
            className="flex items-start justify-between gap-4 p-4"
          >
            <div className="min-w-0">
              <p className="font-medium">
                Version {version.versionNo}
                {version.current && (
                  <span className="text-muted-foreground ml-2 text-sm font-normal">
                    current
                  </span>
                )}
              </p>
              <p className="text-muted-foreground mt-0.5 text-sm">
                {formatWhen(version.createdAt)} ·{" "}
                {version.author === "user"
                  ? "Edited by you"
                  : "Written by DevGuide"}
              </p>
              {version.note && (
                <p className="mt-1 text-sm break-words">{version.note}</p>
              )}
            </div>
            <Link
              href={
                version.current
                  ? `/g/${slug}`
                  : `/g/${slug}?version=${version.versionNo}`
              }
              className="text-primary shrink-0 text-sm underline underline-offset-2"
            >
              View
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

// UTC, so the server and the browser show the same text.
function formatWhen(iso: string) {
  return `${new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  })} UTC`;
}
