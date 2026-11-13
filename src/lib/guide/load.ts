import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../supabase/database.types";
import type { GuideSection } from "../agents/generate/guide/saveGuide";

// Reads a finished guide for the reading page (SRS FR-GUIDE-1).
//
//   loadGuide(db, "zod") -> { guideId: "…", mine: false, name: "Zod", version: "4.1.0", status: "ready", versionNo: 2,
//                             sections: [{ key, title, markdown, citations, needs_review }, ...] }
//   loadGuide(db, "nope") -> null      no technology, or no guide with content yet
//
// Shows YOUR copy when you have one (you edited the guide: M8), otherwise the shared guide. Row Level
// Security lets a person see the shared guide and their own copy only, so no one else's copy can
// turn up here.
//
// Runs as the signed-in person (Row Level Security applies).

export type GuideDb = SupabaseClient<Database>;

export type LoadedGuide = {
  /** The guide being shown (the shared one, or your copy): where an edit is sent. */
  guideId: string;
  /** True when this is your own copy of the guide. */
  mine: boolean;
  name: string;
  slug: string;
  version: string | null;
  status: string;
  versionNo: number;
  sections: GuideSection[];
};

export const Sections = z.array(
  z.object({
    key: z.string(),
    title: z.string(),
    markdown: z.string(),
    citations: z.array(
      z.object({ n: z.number(), url: z.string(), title: z.string() }),
    ),
    needs_review: z.boolean(),
  }),
);

export async function loadGuide(
  db: GuideDb,
  slug: string,
): Promise<LoadedGuide | null> {
  const { data: technology } = await db
    .from("technologies")
    .select("id, name, slug, latest_version")
    .eq("slug", slug)
    .maybeSingle();
  if (!technology) return null;

  // Both the shared guide and (if any) my own copy come back; my copy wins.
  const { data: guides } = await db
    .from("guides")
    .select("id, owner_id, status, current_version_id")
    .eq("technology_id", technology.id)
    .not("current_version_id", "is", null);
  const guide =
    guides?.find((candidate) => candidate.owner_id !== null) ??
    guides?.find((candidate) => candidate.owner_id === null);
  if (!guide?.current_version_id) return null;

  const { data: version } = await db
    .from("guide_versions")
    .select("version_no, sections")
    .eq("id", guide.current_version_id)
    .maybeSingle();
  if (!version) return null;

  const sections = Sections.safeParse(version.sections);
  if (!sections.success) return null;

  return {
    guideId: guide.id,
    mine: guide.owner_id !== null,
    name: technology.name,
    slug: technology.slug,
    version: technology.latest_version,
    status: guide.status,
    versionNo: version.version_no,
    sections: sections.data,
  };
}
