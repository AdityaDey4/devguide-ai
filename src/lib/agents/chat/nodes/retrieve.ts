import { MIN_RELEVANCE } from "../config";
import type { ChatDeps } from "../deps";
import type { ChatStateType, ChatUpdate } from "../state";

// Step 2 of the chat graph (FR-CHAT-1, FR-CHAT-3): find the stored text that may answer.
//
//   standaloneQuery + variants -> hybrid search in THIS technology (and this guide's own text)
//     -> up to 40 candidates -> the reranker keeps the best 5 -> weak ones are dropped
//
// The search never leaves the technology. An empty `chunks` means "nothing stored answers this".

export async function retrieve(
  state: ChatStateType,
  deps: ChatDeps,
): Promise<ChatUpdate> {
  const candidates = await deps.retrieve({
    technologyId: state.technology.id,
    ...(state.guideId && { guideId: state.guideId }),
    queries: [state.standaloneQuery, ...state.variants],
  });
  const ranked = await deps.rerank({
    question: state.standaloneQuery,
    candidates,
  });

  return { chunks: ranked.filter((c) => c.relevance >= MIN_RELEVANCE) };
}
