import type { ChatDeps } from "../deps";
import type { ChatStateType, ChatUpdate } from "../state";

// Before any search: has this question been answered already? (semantic cache, step 3)
//
//   state.standaloneQuery = "How do I install Zod on Windows?"
//     saved answer found -> the saved text is sent as the reply, with its citations and origin;
//                           the graph ends here (nothing searched, graded or written)
//     nothing found      -> {}  and the graph carries on to retrieve
//
// The rewritten question is looked up, not the raw message, so "and a URL?" is already
// "How do I validate a URL with Zod?" by now. A failed lookup is a miss (the cache never breaks a chat).

export async function cacheLookup(
  state: ChatStateType,
  deps: ChatDeps,
  onToken: (piece: string) => void | Promise<void>,
): Promise<ChatUpdate> {
  const hit = await deps.lookupCache?.(state.standaloneQuery);
  if (!hit) return {};
  await onToken(hit.answer);
  return {
    reply: hit.answer,
    citations: hit.citations,
    origin: hit.origin,
    fromCache: true,
  };
}
