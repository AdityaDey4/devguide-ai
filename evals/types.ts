/** One line of retrieval.jsonl: a question and the pages that correctly answer it. */
export type EvalQuestion = {
  id: string;
  technology: string;
  question: string;
  expectedUrls: string[];
};

/** The four ways of searching that the evals compare. */
export const METHODS = [
  "vector",
  "keyword",
  "hybrid",
  "hybrid+rerank",
] as const;
export type MethodName = (typeof METHODS)[number];

/** How one method did on one question. */
export type MethodResult = {
  /** Position (1 = first) of the first chunk from an expected page; null if there is none. */
  rank: number | null;
  /** The pages of the first 5 chunks, to see what was found instead. */
  top5: (string | null)[];
};

export type QuestionResult = {
  question: EvalQuestion;
  methods: Record<MethodName, MethodResult>;
  /** Relevance (0 to 1) the reranker gave its best chunk; used to calibrate the fast path. */
  topRelevance: number;
};
