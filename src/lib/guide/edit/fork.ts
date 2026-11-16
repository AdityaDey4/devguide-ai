import type { GuideSection } from "../../agents/generate/guide/saveGuide";
import type { ServiceClient } from "../../supabase/service";
import { addVersion } from "../versions";

// A person's own copy of a shared guide (SRS section 1: "a personal fork is created for that user").
// The shared guide is never changed by an edit; the edit goes into the person's copy.
//
//   findFork(db, technologyId, userId)             -> the person's copy of that guide, or null
//   createFork(db, shared, userId, sharedSections) -> the id of a new copy, whose version 1 is a
//                                                     copy of the shared guide as it is now
//
// The copy starts with the shared text as its version 1, so "restore version 1" always gets the
// person back to the original. Server only (it writes).

export type GuideRow = {
  id: string;
  technology_id: string;
  owner_id: string | null;
  status: string;
  current_version_id: string | null;
};

const COLUMNS = "id, technology_id, owner_id, status, current_version_id";

export async function findFork(
  db: ServiceClient,
  technologyId: string,
  userId: string,
): Promise<GuideRow | null> {
  const { data, error } = await db
    .from("guides")
    .select(COLUMNS)
    .eq("technology_id", technologyId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Could not read your copy: ${error.message}`);
  return data;
}

/**
 * The person's copy, made now: found if it exists (two first edits at the same moment, or a copy
 * that was made but never got its first version), created otherwise. It always has a version 1
 * when this returns.
 */
export async function createFork(
  db: ServiceClient,
  shared: GuideRow,
  userId: string,
  sharedSections: GuideSection[],
): Promise<string> {
  let fork = await findFork(db, shared.technology_id, userId);

  if (!fork) {
    const { data, error } = await db
      .from("guides")
      .insert({
        technology_id: shared.technology_id,
        owner_id: userId,
        forked_from: shared.id,
        status: shared.status,
      })
      .select(COLUMNS)
      .single();
    if (error?.code === "23505") {
      // The other first edit won (unique technology + owner): use its copy.
      fork = await findFork(db, shared.technology_id, userId);
    } else if (error) {
      throw new Error(`Could not make your copy: ${error.message}`);
    } else {
      fork = data;
    }
  }
  if (!fork) throw new Error("Could not make your copy");

  if (!fork.current_version_id) {
    await addVersion(db, {
      guideId: fork.id,
      sections: sharedSections,
      authorType: "agent",
      authorId: null,
      changeNote: "Copy of the shared guide",
    });
  }
  return fork.id;
}
