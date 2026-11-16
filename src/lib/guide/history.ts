import type { GuideDb } from "./load";

// The versions of a guide, newest first, for the history list (SRS FR-GUIDE-5, M8).
//
//   listVersions(db, guideId)
//     -> [{ versionNo: 3, createdAt: "2026-11-16T…", note: "Restored version 1", author: "user", current: true },
//         { versionNo: 2, ..., note: "Use pnpm", author: "user", current: false },
//         { versionNo: 1, ..., note: "Copy of the shared guide", author: "agent", current: false }]
//
// Runs as the signed-in person (Row Level Security applies): only the shared guide's and their own
// copy's versions can be read. The text of the versions is not loaded, only the list.

export type VersionEntry = {
  versionNo: number;
  createdAt: string;
  note: string | null;
  author: "agent" | "user";
  current: boolean;
};

export async function listVersions(
  db: GuideDb,
  guideId: string,
): Promise<VersionEntry[]> {
  const [{ data: guide }, { data: versions }] = await Promise.all([
    db
      .from("guides")
      .select("current_version_id")
      .eq("id", guideId)
      .maybeSingle(),
    db
      .from("guide_versions")
      .select("id, version_no, created_at, change_note, author_type")
      .eq("guide_id", guideId)
      .order("version_no", { ascending: false }),
  ]);

  return (versions ?? []).map((version) => ({
    versionNo: version.version_no,
    createdAt: version.created_at,
    note: version.change_note,
    author: version.author_type === "user" ? "user" : "agent",
    current: version.id === guide?.current_version_id,
  }));
}
