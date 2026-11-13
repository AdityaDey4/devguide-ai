import type { Ranked } from "../../rag/reranker";
import { isFresh, type ChatOrigin } from "./origin";
import type { ExternalDoc } from "./state";

// Which of the pages found while answering are worth keeping for next time (SRS FR-CHAT-9's
// "remembers what it found").
//
//   external = [Context7 snippet (used), live page A (used), live page B (nothing relevant)]
//     -> [Context7 snippet, live page A]
//
// A page is kept only if some of its text is among the chunks the answer was written from, which
// means the reranker found it relevant. A page that merely came back from the search is thrown
// away: keeping it would fill the knowledge base with pages that answer nothing. Nothing at all
// is kept for an answer that was not found.

export function docsWorthKeeping(
  external: ExternalDoc[],
  chunks: Ranked[],
  origin: ChatOrigin,
): ExternalDoc[] {
  if (origin === "not_found") return [];

  const used = new Set(chunks.filter(isFresh).map((chunk) => chunk.sourceUrl));
  const seen = new Set<string>();
  return external.filter((doc) => {
    if (!used.has(doc.url) || seen.has(doc.url)) return false;
    seen.add(doc.url);
    return true;
  });
}
