import { contentHash } from "../../../rag/store";
import { MIN_RELEVANCE } from "../config";
import type { ChatDeps } from "../deps";
import type { ChatStateType, ChatUpdate } from "../state";

// Step 2 of the chat graph (FR-CHAT-1, FR-CHAT-3): find the stored text that may answer.
//
//   standaloneQuery + variants -> hybrid search in THIS technology (and this guide's own text)
//     -> up to 40 candidates -> the reranker keeps the best 5 -> weak ones are dropped
//
// On a person's copy it searches the copy and the shared guide, minus the passages the copy replaced.
// The search never leaves the technology. An empty `chunks` means "nothing stored answers this".

export async function retrieve(
  state: ChatStateType,
  deps: ChatDeps,
): Promise<ChatUpdate> {
  const candidates = await deps.retrieve({
    technologyId: state.technology.id,
    ...(state.guideId && { guideId: state.guideId }),
    ...(state.alsoGuideId && { alsoGuideId: state.alsoGuideId }),
    queries: [state.standaloneQuery, ...state.variants],
  });
  // On a person's copy, shared passages they rewrote are old news: leave them out.
  const hidden = new Set(state.hiddenHashes);
  const usable =
    hidden.size === 0
      ? candidates
      : candidates.filter((c) => !hidden.has(contentHash(c.content)));
  const ranked = await deps.rerank({
    question: state.standaloneQuery,
    candidates: usable,
  });

  return { chunks: ranked.filter((c) => c.relevance >= MIN_RELEVANCE) };
}
