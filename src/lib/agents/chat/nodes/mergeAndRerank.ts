import { chunkMarkdown } from "../../../rag/chunker";
import type { Candidate } from "../../../rag/retriever";
import { MAX_EXTERNAL_CHUNKS, MIN_RELEVANCE } from "../config";
import type { ChatDeps } from "../deps";
import { FRESH_PREFIX } from "../origin";
import type { ChatStateType, ChatUpdate } from "../state";

// After the outside lookups (SRS FR-CHAT-7): put what was found together with the stored chunks
// kept so far, and pick the best 5 again.
//
//   state.chunks   [stored guide chunk, stored docs chunk]     kept from the first search
//   state.external [Context7 snippet, live page of 8 chunks]   found just now
//     -> cut the new text into chunks (in memory, nothing is saved here)
//     -> rerank all of them together -> the best 5, weak ones dropped
//
// Nothing is embedded: the reranker reads the text itself, so a chunk found a moment ago competes
// on equal terms with one that has been stored for weeks.

export async function mergeAndRerank(
  state: ChatStateType,
  deps: ChatDeps,
): Promise<ChatUpdate> {
  const known = new Set(state.chunks.map((chunk) => chunk.content));

  const fresh: Candidate[] = state.external
    .flatMap((doc) =>
      chunkMarkdown(doc.markdown, { title: doc.title }).map((chunk) => ({
        id: `${FRESH_PREFIX}${doc.url}#${chunk.content.length}:${chunk.content.slice(0, 40)}`,
        content: chunk.content,
        headingPath: chunk.headingPath,
        sourceType: doc.type,
        sourceId: null,
        sourceUrl: doc.url,
        sourceTitle: doc.title,
        score: 0,
      })),
    )
    .filter((chunk) => !known.has(chunk.content)) // already among the kept ones
    .slice(0, MAX_EXTERNAL_CHUNKS);

  if (fresh.length === 0) return {}; // nothing new: the kept chunks stand

  const ranked = await deps.rerank({
    question: state.standaloneQuery,
    candidates: [...state.chunks, ...fresh],
  });
  return { chunks: ranked.filter((c) => c.relevance >= MIN_RELEVANCE) };
}
