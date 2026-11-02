import { rerank } from "../src/lib/rag/reranker";
import { retrieve, type Candidate } from "../src/lib/rag/retriever";
import type { RetrieveDeps } from "../src/lib/rag/retriever/types";
import { firstHitRank } from "./metrics";
import type { EvalQuestion, MethodResult, QuestionResult } from "./types";

// Runs ONE question through all four ways of searching and records where the right page landed.
//
//   const result = await evaluateQuestion(question, technologyId, deps);
//   result.methods.hybrid -> { rank: 2, top5: ["https://zod.dev/api", "https://zod.dev/basics", ...] }

/** Enough to rank the reranker's whole input list, so MRR is comparable with the other methods. */
const RERANK_KEEP = 40;

export async function evaluateQuestion(
  question: EvalQuestion,
  technologyId: string,
  deps: RetrieveDeps,
): Promise<QuestionResult> {
  const search = (mode: "vector" | "keyword" | "hybrid") =>
    retrieve({ technologyId, queries: [question.question], mode }, deps);

  const [vector, keyword, hybrid] = await Promise.all([
    search("vector"),
    search("keyword"),
    search("hybrid"),
  ]);
  // Rerank the hybrid candidates: what the chat will do.
  const reranked = await rerank({
    question: question.question,
    candidates: hybrid,
    topK: RERANK_KEEP,
  });

  return {
    question,
    methods: {
      vector: summary(vector, question),
      keyword: summary(keyword, question),
      hybrid: summary(hybrid, question),
      "hybrid+rerank": summary(reranked, question),
    },
    topRelevance: reranked[0]?.relevance ?? 0,
  };
}

function summary(chunks: Candidate[], question: EvalQuestion): MethodResult {
  const urls = chunks.map((chunk) => chunk.sourceUrl);
  return {
    rank: firstHitRank(urls, question.expectedUrls),
    top5: urls.slice(0, 5),
  };
}
