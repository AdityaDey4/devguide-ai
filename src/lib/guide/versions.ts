import type { GuideSection } from "../agents/generate/guide/saveGuide";
import type { Json } from "../supabase/database.types";
import type { ServiceClient } from "../supabase/service";

// Adds one more version to a guide and makes it the current one (SRS FR-GUIDE-5). Nothing is ever
// overwritten: the old versions stay, which is what lets a person go back to one.
//
//   addVersion(db, { guideId, sections, authorType: "user", authorId, changeNote: "Fixed a typo" })
//     -> { versionId: "…", versionNo: 3 }
//
// The version number is one more than the highest so far. Two saves at the same moment can pick the
// same number; the database refuses the second (unique guide + number), which is tried once more
// with a fresh number. Server only: it writes, so it uses the service-role key.

export type NewVersion = {
  guideId: string;
  sections: GuideSection[];
  authorType: "agent" | "user";
  authorId: string | null;
  changeNote: string;
};

export async function addVersion(
  db: ServiceClient,
  input: NewVersion,
): Promise<{ versionId: string; versionNo: number }> {
  for (let attempt = 1; ; attempt++) {
    const { data: latest, error: latestError } = await db
      .from("guide_versions")
      .select("version_no")
      .eq("guide_id", input.guideId)
      .order("version_no", { ascending: false })
      .limit(1);
    if (latestError)
      throw new Error(`Could not read guide versions: ${latestError.message}`);
    const versionNo = (latest[0]?.version_no ?? 0) + 1;

    const { data: version, error } = await db
      .from("guide_versions")
      .insert({
        guide_id: input.guideId,
        version_no: versionNo,
        sections: input.sections as unknown as NonNullable<Json>,
        author_type: input.authorType,
        author_id: input.authorId,
        change_note: input.changeNote,
      })
      .select("id")
      .single();

    if (error?.code === "23505" && attempt < 2) continue; // someone saved at the same moment
    if (error) {
      throw new Error(`Could not save the guide version: ${error.message}`);
    }

    const { error: pointerError } = await db
      .from("guides")
      .update({ current_version_id: version.id })
      .eq("id", input.guideId);
    if (pointerError) {
      throw new Error(`Could not update the guide: ${pointerError.message}`);
    }
    return { versionId: version.id, versionNo };
  }
}
