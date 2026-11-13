import type { ExternalDoc } from "../agents/chat";
import { chunkMarkdown } from "../rag/chunker";
import { contentHash, storeChunks, type StoreInput } from "../rag/store";

// Remembers what the chat found outside the stored text, so the next person who asks the same
// thing gets it from the stored docs, with no outside calls (SRS FR-CHAT-9, FR-KB-3 to FR-KB-6).
//
//   saveFetched(technologyId, [{ url, title: "fs | Node.js", type: "official", markdown }])
//     -> 1        pages saved
//
// Each page is cut into chunks and handed to the same store the guide uses: chunks already stored
// are skipped before any embedding is paid for, and the expiry is set by the source type (official
// pages 90 days, Context7 snippets 30). It runs after the answer has been sent, so it never
// delays the person, and it never throws: a page that cannot be saved is logged and skipped.
// Server only.

export type SaveFetchedDeps = {
  store: (input: StoreInput) => Promise<unknown>;
};

const realDeps: SaveFetchedDeps = { store: (input) => storeChunks(input) };

export async function saveFetched(
  technologyId: string,
  docs: ExternalDoc[],
  deps: SaveFetchedDeps = realDeps,
): Promise<number> {
  let saved = 0;
  for (const doc of docs) {
    try {
      await deps.store({
        technologyId,
        source: {
          url: doc.url,
          title: doc.title,
          type: doc.type,
          contentHash: contentHash(doc.markdown),
        },
        chunks: chunkMarkdown(doc.markdown, { title: doc.title }),
      });
      saved++;
    } catch (error) {
      console.error(
        "chat: could not save a fetched page:",
        error instanceof Error ? error.message : "unknown error",
      );
    }
  }
  return saved;
}
