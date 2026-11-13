import type { ServiceClient } from "../../supabase/service";
import { Sections } from "../load";
import { addVersion } from "../versions";
import { applyEdits, type EditEntry } from "./applyEdits";
import { createFork, findFork, type GuideRow } from "./fork";

// Saves a person's edit of a guide as a new version (SRS FR-GUIDE-3, docs/05 M8).
//
//   saveEdit(db, { guideId, userId, edits: [{ key: "installation", markdown: "..." }], note: "Fixed a typo" })
//     -> { ok: true, guideId: "<their copy>", versionId, versionNo: 2, forked: true }
//     |  { ok: false, status: 400, error: "Nothing was changed" }
//
// 1. `guideId` is the guide the person was looking at: the shared one, or their own copy. Someone
//    else's copy is reported as "not found", never as "not yours".
// 2. The text to edit is their copy's current version if they have one, else the shared guide's.
// 3. The edit is applied and checked FIRST: a save that changes nothing makes no copy and no version.
// 4. The first edit of a shared guide makes the person's copy (its version 1 is the shared text);
//    the edit becomes the next version of the copy. The shared guide is never touched.
//
// Server only. It writes, so `db` is the service-role client; the caller has already checked who
// the person is.

export type SaveEditInput = {
  guideId: string;
  userId: string;
  edits: EditEntry[];
  note?: string;
};

export type SaveEditResult =
  | {
      ok: true;
      guideId: string;
      versionId: string;
      versionNo: number;
      /** True when this edit made the person's own copy. */
      forked: boolean;
    }
  | { ok: false; status: 400 | 404 | 409; error: string };

const COLUMNS = "id, technology_id, owner_id, status, current_version_id";

export async function saveEdit(
  db: ServiceClient,
  input: SaveEditInput,
): Promise<SaveEditResult> {
  // 1. The guide shown, if the person may see it.
  const { data: guide, error } = await db
    .from("guides")
    .select(COLUMNS)
    .eq("id", input.guideId)
    .maybeSingle();
  if (error) throw new Error(`Could not read the guide: ${error.message}`);
  if (!guide || (guide.owner_id !== null && guide.owner_id !== input.userId)) {
    return { ok: false, status: 404, error: "There is no such guide" };
  }

  // 2. Their copy if they have one (whichever of the two they were looking at), else the shared one.
  const shared = guide.owner_id === null ? guide : null;
  const mine = shared
    ? await findFork(db, guide.technology_id, input.userId)
    : guide;
  const base = mine?.current_version_id ? mine : guide;

  const current = await sectionsOf(db, base);
  if (!current) {
    return { ok: false, status: 409, error: "This guide has no text to edit" };
  }

  // 3. Apply and check before anything is created.
  const applied = applyEdits(current, input.edits);
  if (!applied.ok) return { ok: false, status: 400, error: applied.error };

  // 4. Their own copy: made now if this is their first edit.
  const forkId = mine?.current_version_id
    ? mine.id
    : await createFork(db, guide, input.userId, current);
  const forked = !mine?.current_version_id;

  const titles = applied.changed
    .map((key) => current.find((section) => section.key === key)?.title ?? key)
    .join(", ");
  const saved = await addVersion(db, {
    guideId: forkId,
    sections: applied.sections,
    authorType: "user",
    authorId: input.userId,
    changeNote: input.note?.trim() || `Edited ${titles}`.slice(0, 200),
  });

  return { ok: true, guideId: forkId, ...saved, forked };
}

async function sectionsOf(db: ServiceClient, guide: GuideRow) {
  if (!guide.current_version_id) return null;
  const { data } = await db
    .from("guide_versions")
    .select("sections")
    .eq("id", guide.current_version_id)
    .maybeSingle();
  const parsed = Sections.safeParse(data?.sections);
  return parsed.success ? parsed.data : null;
}
