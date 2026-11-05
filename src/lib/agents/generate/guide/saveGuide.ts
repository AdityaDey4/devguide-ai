import type { Json } from "../../../supabase/database.types";
import type { ServiceClient } from "../../../supabase/service";

// Saves a finished guide in the database: the guide row, a NEW version of its sections, and the
// pointer to it. Generating again for the same technology adds version 2, 3, ... and keeps the
// old ones (SRS FR-GUIDE versions).
//
//   saveGuide(db, { technologyId, sections, status: "ready" })
//     -> { guideId: "…", versionId: "…", versionNo: 1 }
//
// The canonical guide (no owner) is the shared one every signed-in user reads. Server only.

/** A section as stored in `guide_versions.sections` (docs/03-Architecture.md section 4). */
export type GuideSection = {
  key: string;
  title: string;
  markdown: string;
  citations: { n: number; url: string; title: string }[];
  needs_review: boolean;
};

export type SaveGuideInput = {
  technologyId: string;
  sections: GuideSection[];
  /** "ready" when every section cites a source; "partial" otherwise. */
  status: "ready" | "partial";
  changeNote?: string;
};

export type SavedGuide = {
  guideId: string;
  versionId: string;
  versionNo: number;
};

export async function saveGuide(
  db: ServiceClient,
  input: SaveGuideInput,
  now: Date = new Date(),
): Promise<SavedGuide> {
  const guideId = await canonicalGuideId(db, input.technologyId);

  // Next version number: one more than the highest so far.
  const { data: latest, error: latestError } = await db
    .from("guide_versions")
    .select("version_no")
    .eq("guide_id", guideId)
    .order("version_no", { ascending: false })
    .limit(1);
  if (latestError)
    throw new Error(`Could not read guide versions: ${latestError.message}`);
  const versionNo = (latest[0]?.version_no ?? 0) + 1;

  const { data: version, error: versionError } = await db
    .from("guide_versions")
    .insert({
      guide_id: guideId,
      version_no: versionNo,
      sections: input.sections as unknown as NonNullable<Json>,
      author_type: "agent",
      change_note:
        input.changeNote ?? "Generated from the official documentation",
    })
    .select("id")
    .single();
  if (versionError)
    throw new Error(
      `Could not save the guide version: ${versionError.message}`,
    );

  const { error: guideError } = await db
    .from("guides")
    .update({
      current_version_id: version.id,
      status: input.status,
      last_refreshed_at: now.toISOString(),
    })
    .eq("id", guideId);
  if (guideError)
    throw new Error(`Could not update the guide: ${guideError.message}`);

  // The old text of this guide is replaced by the new version's text in the chat's knowledge.
  const { error: chunkError } = await db
    .from("chunks")
    .delete()
    .eq("guide_id", guideId);
  if (chunkError)
    throw new Error(`Could not clear old guide text: ${chunkError.message}`);

  return { guideId, versionId: version.id, versionNo };
}

/** The shared guide of a technology: found, or created on first use. */
async function canonicalGuideId(
  db: ServiceClient,
  technologyId: string,
): Promise<string> {
  const find = () =>
    db
      .from("guides")
      .select("id")
      .eq("technology_id", technologyId)
      .is("owner_id", null)
      .maybeSingle();

  const existing = await find();
  if (existing.error)
    throw new Error(`Could not read the guide: ${existing.error.message}`);
  if (existing.data) return existing.data.id;

  const created = await db
    .from("guides")
    .insert({
      technology_id: technologyId,
      owner_id: null,
      status: "generating",
    })
    .select("id")
    .single();
  if (!created.error) return created.data.id;

  // Someone else created it a moment ago (the unique index refused ours): use theirs.
  if (created.error.code === "23505") {
    const again = await find();
    if (again.data) return again.data.id;
  }
  throw new Error(`Could not create the guide: ${created.error.message}`);
}
