import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../supabase/database.types";
import type { GuideSection } from "../agents/generate/guide/saveGuide";

// Reads a finished guide for the reading page (SRS FR-GUIDE-1).
//
//   loadGuide(db, "zod") -> { name: "Zod", version: "4.1.0", status: "ready", versionNo: 2,
//                             sections: [{ key, title, markdown, citations, needs_review }, ...] }
//   loadGuide(db, "nope") -> null      no technology, or no shared guide with content yet
//
// Runs as the signed-in person (Row Level Security applies).

export type GuideDb = SupabaseClient<Database>;

export type LoadedGuide = {
  name: string;
  slug: string;
  version: string | null;
  status: string;
  versionNo: number;
  sections: GuideSection[];
};

const Sections = z.array(
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

  const { data: guide } = await db
    .from("guides")
    .select("status, current_version_id")
    .eq("technology_id", technology.id)
    .is("owner_id", null)
    .not("current_version_id", "is", null)
    .maybeSingle();
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
    name: technology.name,
    slug: technology.slug,
    version: technology.latest_version,
    status: guide.status,
    versionNo: version.version_no,
    sections: sections.data,
  };
}
