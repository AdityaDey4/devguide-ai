import { Sections, type GuideDb } from "../guide/load";
import type { ChatTechnology } from "../agents/chat";
import { guideChunks } from "../rag/guideIndex";
import { contentHash } from "../rag/store";

// What a question is asked about: a technology and its guide (SRS FR-CHAT-1, M8).
//
//   findChatScope(db, "zod")
//     -> { technology: { id, name: "Zod", version: "4.1.0" }, guideId,
//          alsoGuideId?, hiddenHashes: [] }
//   findChatScope(db, "nope") -> null      no technology, or no guide with content yet
//
// Runs as the signed-in person (Row Level Security applies): they see the shared guide and their
// own copy only. Without a copy, the chat searches the shared guide. With one (they edited it),
// it searches the copy AND the shared guide, except the shared passages their edit replaced
// (`hiddenHashes`), so an answer follows their text, not the old text. The copy only stores the
// passages that are new, because identical text is stored once per technology.

export type ChatScope = {
  technology: ChatTechnology;
  guideId: string;
  /** The shared guide, when `guideId` is the person's copy. */
  alsoGuideId?: string;
  /** Fingerprints of shared passages the copy replaced. */
  hiddenHashes: string[];
};

export async function findChatScope(
  db: GuideDb,
  slug: string,
): Promise<ChatScope | null> {
  const { data: technology } = await db
    .from("technologies")
    .select("id, name, latest_version, docs_url, official_url")
    .eq("slug", slug)
    .maybeSingle();
  if (!technology) return null;

  const { data: guides } = await db
    .from("guides")
    .select("id, owner_id, current_version_id")
    .eq("technology_id", technology.id)
    .not("current_version_id", "is", null);
  const shared = guides?.find((guide) => guide.owner_id === null);
  const mine = guides?.find((guide) => guide.owner_id !== null);
  const searched = mine ?? shared;
  if (!searched) return null;

  const scope: ChatScope = {
    technology: {
      id: technology.id,
      name: technology.name,
      version: technology.latest_version,
      docsUrl: technology.docs_url,
      officialUrl: technology.official_url,
    },
    guideId: searched.id,
    hiddenHashes: [],
  };
  if (mine && shared) {
    scope.alsoGuideId = shared.id;
    scope.hiddenHashes = await replacedPassages(
      db,
      technology.name,
      shared.current_version_id,
      mine.current_version_id,
    );
  }
  return scope;
}

/** Fingerprints of passages the shared guide has that the copy no longer has. */
async function replacedPassages(
  db: GuideDb,
  name: string,
  sharedVersionId: string | null,
  mineVersionId: string | null,
): Promise<string[]> {
  const [shared, mine] = await Promise.all([
    hashesOf(db, name, sharedVersionId),
    hashesOf(db, name, mineVersionId),
  ]);
  if (!shared || !mine) return []; // cannot tell: hide nothing
  return [...shared].filter((hash) => !mine.has(hash));
}

async function hashesOf(
  db: GuideDb,
  name: string,
  versionId: string | null,
): Promise<Set<string> | null> {
  if (!versionId) return null;
  const { data } = await db
    .from("guide_versions")
    .select("sections")
    .eq("id", versionId)
    .maybeSingle();
  const sections = Sections.safeParse(data?.sections);
  if (!sections.success) return null;
  return new Set(
    guideChunks(name, sections.data).map((chunk) => contentHash(chunk.content)),
  );
}
