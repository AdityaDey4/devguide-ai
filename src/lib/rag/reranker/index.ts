import { ask } from "./client";
import { MAX_CANDIDATES, readSettings, TOP_K } from "./config";
import { buildMessages } from "./prompt";
import { parseScores } from "./parse";
import type { Ranked, RerankDeps, RerankInput } from "./types";

export { RerankError } from "./errors";
export type { RerankErrorKind } from "./errors";
export type { Ranked, RerankInput, Reranker } from "./types";

// Picks the chunks that really answer the question (SRS FR-CHAT-3).
//
//   const top = await rerank({ question, candidates });   // candidates from retrieve()
//   top[0] -> { content: "...", sourceUrl: "...", score: 0.032, relevance: 0.9 }
//
// One call to a small OpenAI model scores all candidates 0 to 10; the best 5 are kept, best
// first. `relevance` (0 to 1) is what the fast-path threshold looks at.
// Read this file first: it is the whole recipe. Server only: it uses the OpenAI key.

const realDeps: RerankDeps = { settings: readSettings, ask };

export async function rerank(
  input: RerankInput,
  deps: RerankDeps = realDeps,
): Promise<Ranked[]> {
  const candidates = input.candidates.slice(0, MAX_CANDIDATES);
  if (candidates.length === 0) return [];

  const settings = deps.settings(); // 1. which model, which key (fails early if missing)
  const messages = buildMessages(input.question, candidates); // 2. numbered excerpts + rules
  const answer = await deps.ask(settings, messages, input.signal); // 3. one model call
  const relevance = parseScores(answer, candidates.length); // 4. one number per candidate

  // 5. best first; equal relevance keeps the retriever's order; keep the top 5
  return candidates
    .map((candidate, i) => ({ ...candidate, relevance: relevance[i] }))
    .sort((a, b) => b.relevance - a.relevance || b.score - a.score)
    .slice(0, input.topK ?? TOP_K);
}
