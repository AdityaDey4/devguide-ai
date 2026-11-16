import type { ServiceClient } from "../../supabase/service";
import { Sections } from "../load";
import { addVersion } from "../versions";
import { indexCopy, realIndexDeps, type IndexDeps } from "./indexCopy";

// Restores an older version of a person's own copy as a NEW version (SRS FR-GUIDE-5, docs/05 M8).
//
//   restoreVersion(db, { guideId: "<their copy>", userId, versionNo: 1 })
//     -> { ok: true, versionId, versionNo: 4 }          v4 has the text of v1; v2 and v3 stay
//     |  { ok: false, status: 400, error: "That is already the current version" }
//
// Nothing is deleted or rewritten: the restore is one more version, so it can be undone by restoring
// the one before it. Only the person's own copy can be restored: the shared guide is never changed
// (to get an old shared version, edit your copy). Someone else's copy is "not found".
// The restored text is made searchable for the chat, as after an edit.
//
// Server only. It writes, so `db` is the service-role client; the caller has already checked who
// the person is.

export type RestoreInput = {
  guideId: string;
  userId: string;
  versionNo: number;
};

export type RestoreResult =
  | { ok: true; versionId: string; versionNo: number }
  | { ok: false; status: 400 | 404; error: string };

export async function restoreVersion(
  db: ServiceClient,
  input: RestoreInput,
  deps: IndexDeps = realIndexDeps,
): Promise<RestoreResult> {
  const { data: guide, error } = await db
    .from("guides")
    .select("id, technology_id, owner_id, current_version_id")
    .eq("id", input.guideId)
    .maybeSingle();
  if (error) throw new Error(`Could not read the guide: ${error.message}`);
  if (!guide || (guide.owner_id !== null && guide.owner_id !== input.userId)) {
    return { ok: false, status: 404, error: "There is no such guide" };
  }
  if (guide.owner_id === null) {
    return {
      ok: false,
      status: 400,
      error: "Only your own copy can be restored. Edit the guide to make one.",
    };
  }

  const { data: version } = await db
    .from("guide_versions")
    .select("id, sections")
    .eq("guide_id", guide.id)
    .eq("version_no", input.versionNo)
    .maybeSingle();
  const sections = Sections.safeParse(version?.sections);
  if (!version || !sections.success) {
    return { ok: false, status: 404, error: "There is no such version" };
  }
  if (version.id === guide.current_version_id) {
    return {
      ok: false,
      status: 400,
      error: "That is already the current version",
    };
  }

  const saved = await addVersion(db, {
    guideId: guide.id,
    sections: sections.data,
    authorType: "user",
    authorId: input.userId,
    changeNote: `Restored version ${input.versionNo}`,
  });
  await indexCopy(db, deps, guide.technology_id, guide.id, sections.data);
  return { ok: true, ...saved };
}
