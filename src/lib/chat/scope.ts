import type { GuideDb } from "../guide/load";
import type { ChatTechnology } from "../agents/chat";

// What a question is asked about: a technology and its shared guide (SRS FR-CHAT-1).
//
//   findChatScope(db, "zod") -> { technology: { id, name: "Zod", version: "4.1.0" }, guideId }
//   findChatScope(db, "nope") -> null      no technology, or no guide with content yet
//
// Runs as the signed-in person (Row Level Security applies). The chat searches stored text, so a
// technology with no guide yet has nothing to ask about.

export type ChatScope = { technology: ChatTechnology; guideId: string };

export async function findChatScope(
  db: GuideDb,
  slug: string,
): Promise<ChatScope | null> {
  const { data: technology } = await db
    .from("technologies")
    .select("id, name, latest_version")
    .eq("slug", slug)
    .maybeSingle();
  if (!technology) return null;

  const { data: guide } = await db
    .from("guides")
    .select("id")
    .eq("technology_id", technology.id)
    .is("owner_id", null)
    .not("current_version_id", "is", null)
    .maybeSingle();
  if (!guide) return null;

  return {
    technology: {
      id: technology.id,
      name: technology.name,
      version: technology.latest_version,
    },
    guideId: guide.id,
  };
}
