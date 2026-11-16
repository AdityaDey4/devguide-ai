import { indexGuide, type IndexGuideInput } from "../../rag/guideIndex";
import type { ServiceClient } from "../../supabase/service";

// Makes a person's copy searchable for the chat after a new version of it is saved (M6 indexing).
// If that fails the version stays saved (the person's work is never lost) and the next save or
// restore indexes again. Shared by saving an edit and restoring a version.
//
// Server only.

export type IndexDeps = {
  index: (input: IndexGuideInput) => Promise<unknown>;
};

export const realIndexDeps: IndexDeps = { index: (input) => indexGuide(input) };

export async function indexCopy(
  db: ServiceClient,
  deps: IndexDeps,
  technologyId: string,
  guideId: string,
  sections: IndexGuideInput["sections"],
) {
  try {
    const { data: technology } = await db
      .from("technologies")
      .select("id, name, slug, latest_version")
      .eq("id", technologyId)
      .single();
    if (!technology) return;
    await deps.index({
      technology: {
        id: technology.id,
        name: technology.name,
        slug: technology.slug,
        version: technology.latest_version,
      },
      guideId,
      sections,
    });
  } catch (error) {
    console.error("Could not make the edited guide searchable", error);
  }
}
